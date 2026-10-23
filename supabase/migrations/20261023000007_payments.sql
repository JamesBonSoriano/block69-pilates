-- =============================================================================
-- Migration 11: payments (Phase D, Step 12).
--
-- What this file does:
--   1. PayMongo checkout, for the pay page (the logged-in client calls these):
--        start_online_payment(booking)   checks the booking can be paid now and
--                                        gives back the amount + any checkout
--                                        that is already open for it
--        save_online_checkout(...)       saves the new PayMongo Checkout
--                                        Session id on a 'pending' payment row
--        confirm_free_booking(booking)   a booking that costs 0 pesos (a 100%
--                                        promo code + own mat) is confirmed
--                                        without PayMongo
--   2. confirm_online_payment(...): the ONE function that marks a PayMongo
--      payment as paid. Only our server (the secret key = service_role) may
--      call it: the PayMongo webhook and the "return" page both use it.
--      It is safe to run twice, and it applies the LATE PAYMENT rule
--      (CLAUDE.md section 5).
--   3. Manual GCash / BPI transfer (backup): submit_manual_payment(...) and
--      the storage policies that let a client upload a screenshot into THEIR
--      OWN folder of the private "payment-screenshots" bucket.
--   4. Admin Billings: admin_billing_summary() (money today / this week /
--      this month, and the mat rental donations).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase
-- project. The website calls the functions from src/lib/booking/
-- payment-actions.ts, src/app/(client)/book/pay/[bookingId]/return/route.ts,
-- src/app/api/paymongo/webhook/route.ts and src/lib/data/admin-setup.ts.
--
-- Money is in pesos here (numeric(10,2)). The website turns it into
-- centavos (x 100) only when it talks to PayMongo.
--
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- =============================================================================
-- 1. PAYMONGO CHECKOUT (pay page)
-- =============================================================================

-- Checks that one of the caller's bookings can be paid online right now, and
-- tells the pay button what to do.
-- Rules: it must be the caller's OWN booking, still 'pending_payment', and
-- its seat hold must still be running.
-- Takes: the booking id.
-- Gives back: one row:
--   total            what to charge, straight from the booking (book_seat
--                    worked it out from settings; the browser never sends it)
--   hold_expires_at  when the seat hold ends
--   class_date, start_time  for the line on PayMongo's page
--   payment_id, paymongo_ref, method  the PayMongo checkout already open for
--                    this booking (all empty if there is none). The website
--                    reuses it instead of making a second one.
-- Stops with a plain-English error otherwise.
create or replace function public.start_online_payment(p_booking_id uuid)
returns table (
  total           numeric,
  hold_expires_at timestamptz,
  class_date      date,
  start_time      time,
  payment_id      uuid,
  paymongo_ref    text,
  method          public.payment_method
)
language plpgsql
stable
security definer  -- clients can't read promo vouchers etc.; we only give back what the button needs
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := public.require_active_user();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id;

  -- Not found, or someone else's booking: the same message for both
  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  if v_booking.status <> 'pending_payment' then
    raise exception 'This booking is no longer waiting for payment.';
  end if;
  if v_booking.hold_expires_at <= now() then
    raise exception 'Sorry, your seat hold has ended. Please book the class again.';
  end if;
  if v_booking.total <= 0 then
    raise exception 'This booking is free, so there is nothing to pay online.';
  end if;

  return query
  select v_booking.total, v_booking.hold_expires_at, s.date, s.start_time, p.id, p.paymongo_ref, p.method
  from public.class_sessions s
  -- The newest PayMongo checkout that is still open for this booking (if any)
  left join lateral (
    select x.id, x.paymongo_ref, x.method
    from public.payments x
    where x.booking_id = v_booking.id
      and x.provider = 'paymongo'
      and x.status = 'pending'
      and x.paymongo_ref is not null
    order by x.created_at desc
    limit 1
  ) p on true
  where s.id = v_booking.session_id;
end;
$$;


-- Saves a new PayMongo Checkout Session on the caller's booking, as a
-- 'pending' payment row (one row = one payment attempt).
-- The website first creates the checkout at PayMongo, then calls this.
-- Rules (checked again here, with the booking LOCKED so two clicks wait in
-- line): the caller's OWN booking, still 'pending_payment', hold running,
-- GCash / Maya / card only, and a PayMongo-looking id ("cs_...").
-- The amount saved is the booking's own total, never a number from outside.
-- Takes:
--   p_booking_id  the booking
--   p_method      the method the client picked on our page (gcash, maya, card)
--   p_ref         PayMongo's Checkout Session id
--   p_replaces    (optional) the old checkout's payment row, when the client
--                 switched method. The website has already expired that
--                 checkout at PayMongo, so its row becomes 'expired' here.
-- Gives back: one row: the payment id and checkout id to send the client to,
-- and saved = true if OUR checkout was saved. saved = false means another
-- click got there first: the website then uses THAT checkout instead and
-- expires its own new one.
create or replace function public.save_online_checkout(
  p_booking_id uuid,
  p_method     public.payment_method,
  p_ref        text,
  p_replaces   uuid default null
)
returns table (
  payment_id   uuid,
  paymongo_ref text,
  saved        boolean
)
language plpgsql
volatile
security definer  -- clients can't write payments directly (migration 2)
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id  uuid := public.require_active_user();
  v_booking  public.bookings%rowtype;
  v_existing public.payments%rowtype;
  v_new_id   uuid;
begin
  if p_method is null or p_method not in ('gcash', 'maya', 'card') then
    raise exception 'Please pick GCash, Maya or a card.';
  end if;
  -- PayMongo's checkout ids look like cs_ + letters and numbers
  if p_ref is null or p_ref !~ '^cs_[A-Za-z0-9]{1,100}$' then
    raise exception 'That doesn''t look like a PayMongo checkout.';
  end if;

  -- LOCK the booking: a second click (or the webhook) waits here.
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  if v_booking.status <> 'pending_payment' then
    raise exception 'This booking is no longer waiting for payment.';
  end if;
  if v_booking.hold_expires_at <= now() then
    raise exception 'Sorry, your seat hold has ended. Please book the class again.';
  end if;

  -- The old checkout the client switched away from is no longer usable
  if p_replaces is not null then
    update public.payments p
      set status = 'expired'
      where p.id = p_replaces
        and p.booking_id = v_booking.id
        and p.provider = 'paymongo'
        and p.status = 'pending';
  end if;

  -- Is another checkout already open for this booking? (a double click)
  select p.* into v_existing
  from public.payments p
  where p.booking_id = v_booking.id
    and p.provider = 'paymongo'
    and p.status = 'pending'
    and p.paymongo_ref is not null
  order by p.created_at desc
  limit 1;

  if found then
    return query select v_existing.id, v_existing.paymongo_ref, false;
    return;
  end if;

  -- Save our checkout as a new payment attempt (amount from the booking)
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref)
  values (v_booking.id, 'paymongo', p_method, v_booking.total, 'pending', p_ref)
  returning id into v_new_id;

  return query select v_new_id, p_ref, true;
end;
$$;


-- Confirms one of the caller's bookings that costs 0 pesos (for example a
-- 100% promo code and their own mat). PayMongo can't take a 0-peso payment,
-- so there is nothing to pay: the booking simply becomes 'confirmed' (the
-- voucher trigger from migration 3 then spends the code's use).
-- Rules: the caller's OWN booking, 'pending_payment', hold running, total 0.
-- Takes: the booking id.
-- Gives back: the new status ('confirmed').
create or replace function public.confirm_free_booking(p_booking_id uuid)
returns public.booking_status
language plpgsql
volatile
security definer  -- clients can't update bookings directly (migration 2)
set search_path = ''
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_booking public.bookings%rowtype;
begin
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  if v_booking.status <> 'pending_payment' then
    raise exception 'This booking is no longer waiting for payment.';
  end if;
  if v_booking.hold_expires_at <= now() then
    raise exception 'Sorry, your seat hold has ended. Please book the class again.';
  end if;
  if v_booking.total <> 0 then
    raise exception 'This booking isn''t free. Please pay for it on this page.';
  end if;

  update public.bookings b set status = 'confirmed' where b.id = v_booking.id;
  return 'confirmed';
end;
$$;


-- =============================================================================
-- 2. CONFIRMING A PAYMONGO PAYMENT (server only)
-- =============================================================================

-- Marks a PayMongo payment as paid and decides what happens to its booking.
-- ONLY OUR SERVER may call it (service_role: the PayMongo webhook and the
-- return page, after they checked the payment with PayMongo itself).
--
-- Safe to run twice (or by the webhook and the return page at the same
-- moment): the class and booking rows are LOCKED, so the second call waits,
-- then sees the payment is already 'paid' and changes nothing.
--
-- What happens to the booking:
--   1. The amount paid isn't the booking's total -> 'paid_needs_action'
--   2. The seat hold is still running -> 'confirmed' (the seat was theirs)
--   3. LATE PAYMENT (the hold ended, or the client gave the hold up): the
--      class row is already locked, so nobody else can take a seat while we
--      check. 'confirmed' only if ALL of these are true, otherwise
--      'paid_needs_action' (it shows at the top of the admin Dashboard):
--        - the class is still open (not cancelled or closed by the cafe)
--        - the class hasn't started yet
--        - the client doesn't already have another seat in that class
--        - a seat is still free
--   4. The booking was already settled some other way (confirmed, awaiting
--      a manual transfer check, cancelled...): the money is recorded as paid
--      but the booking is NOT changed. The admin sees two payments on it and
--      sorts out a refund.
-- Other PayMongo checkouts still open for the same booking become 'expired'.
-- The voucher is NOT spent here: the trigger from migration 3 does it when
-- the booking becomes 'confirmed' or 'paid_needs_action'.
--
-- Takes:
--   p_checkout_ref  PayMongo's Checkout Session id (cs_...)
--   p_booking_id    the booking it is for (from the checkout's metadata,
--                   which only our server writes)
--   p_amount        pesos actually paid (PayMongo's centavos / 100)
--   p_method        gcash / maya / card, or empty if PayMongo didn't say
--   p_paid_at       when PayMongo says it was paid (empty = now). Only
--                   recorded: the hold check always uses the database clock,
--                   so a seat freed by an ended hold is never given twice.
-- Gives back: one row:
--   outcome         'confirmed', 'needs_action', 'already_paid' (nothing
--                   changed) or 'extra_payment' (case 4)
--   booking_status  the booking's status afterwards
create or replace function public.confirm_online_payment(
  p_checkout_ref text,
  p_booking_id   uuid,
  p_amount       numeric,
  p_method       public.payment_method,
  p_paid_at      timestamptz default null
)
returns table (
  outcome        text,
  booking_status public.booking_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session_id uuid;
  v_session    public.class_sessions%rowtype;
  v_booking    public.bookings%rowtype;
  v_payment    public.payments%rowtype;
  v_paid_at    timestamptz := least(coalesce(p_paid_at, now()), now());  -- never in the future
  v_new_status public.booking_status;
begin
  -- 0. Check what we were given
  if p_checkout_ref is null or p_checkout_ref !~ '^cs_[A-Za-z0-9]{1,100}$' then
    raise exception 'That doesn''t look like a PayMongo checkout.';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'The amount paid is missing.';
  end if;
  if p_method is not null and p_method not in ('gcash', 'maya', 'card') then
    raise exception 'PayMongo payments are GCash, Maya or card only.';
  end if;

  -- 1. LOCK the class first, then the booking (the same order as book_seat
  --    and the admin transfer, so two of them can never wait for each other
  --    forever).
  select b.session_id into v_session_id from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  select s.* into v_session from public.class_sessions s where s.id = v_session_id for update;
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;

  -- 2. Find the payment row for this checkout
  select p.* into v_payment from public.payments p where p.paymongo_ref = p_checkout_ref for update;

  if found and v_payment.booking_id <> v_booking.id then
    raise exception 'This PayMongo checkout belongs to a different booking.';
  end if;

  -- Already done (the webhook and the return page both came): change nothing
  if found and v_payment.status = 'paid' then
    return query select 'already_paid'::text, v_booking.status;
    return;
  end if;

  -- No row yet (saving it failed after the checkout was made): add it now,
  -- so the money is never lost
  if not found then
    insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref)
    values (v_booking.id, 'paymongo', p_method, p_amount, 'pending', p_checkout_ref)
    returning * into v_payment;
  end if;

  -- 3. The money arrived: record it (the amount really paid, and the method
  --    PayMongo says was used)
  update public.payments p
    set status = 'paid',
        paid_at = v_paid_at,
        amount = p_amount,
        method = coalesce(p_method, p.method)
    where p.id = v_payment.id;

  -- Any other checkout still open for this booking can't be used any more
  update public.payments p
    set status = 'expired'
    where p.booking_id = v_booking.id
      and p.provider = 'paymongo'
      and p.status = 'pending'
      and p.id <> v_payment.id;

  -- 4. Already settled some other way: keep the booking as it is (case 4)
  if v_booking.status not in ('pending_payment', 'expired') then
    return query select 'extra_payment'::text, v_booking.status;
    return;
  end if;

  -- 5. Decide the booking's new status (cases 1 to 3 above)
  if p_amount <> v_booking.total then
    v_new_status := 'paid_needs_action';                      -- wrong amount
  elsif v_booking.status = 'pending_payment' and v_booking.hold_expires_at > now() then
    v_new_status := 'confirmed';                              -- on time
  elsif v_session.status <> 'open' then
    v_new_status := 'paid_needs_action';                      -- late: cafe cancelled / closed it
  elsif now() >= public.at_manila(v_session.date, v_session.start_time) then
    v_new_status := 'paid_needs_action';                      -- late: class already started
  elsif public.my_seat_status(v_booking.user_id, v_session.id) is not null then
    v_new_status := 'paid_needs_action';                      -- late: they already have a seat in it
  elsif public.seats_taken(v_session.id) >= v_session.capacity then
    v_new_status := 'paid_needs_action';                      -- late: class is full
  else
    v_new_status := 'confirmed';                              -- late, but a seat is still free
  end if;

  update public.bookings b set status = v_new_status where b.id = v_booking.id;

  return query select
    case when v_new_status = 'confirmed' then 'confirmed' else 'needs_action' end,
    v_new_status;
end;
$$;


-- =============================================================================
-- 3. MANUAL GCASH / BPI TRANSFER (backup, only when the admin turned it on)
-- =============================================================================

-- Storage policies for the private "payment-screenshots" bucket (made in
-- migration 10, where admins also got the right to open every file).
-- A file's path starts with the client's user id as a folder, e.g.
-- "6f1c...-...-.../<booking id>-1729651234567.jpg".
-- storage.foldername(name) splits that path into its folders, so [1] is the
-- first folder.
--   Upload: a logged-in client may add files ONLY into their own folder.
--   Read:   a logged-in client may open (and list) ONLY their own folder.
-- There is no update or delete policy for clients, so an uploaded
-- screenshot can't be swapped or removed afterwards.
create policy "Clients upload own payment screenshots"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Clients read own payment screenshots"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );


-- The client says "I sent the money by GCash / BPI, here is my screenshot".
-- Rules: the caller's OWN booking, still 'pending_payment', hold running,
-- manual payments turned on (setting manual_payment_enabled), GCash or BPI,
-- and the screenshot must already be uploaded in the caller's OWN folder.
-- What it does: adds a 'manual' / 'pending' payment row with the screenshot
-- and the booking's total, and sets the booking to 'awaiting_verification'.
-- That status KEEPS the seat (seats_taken counts it) until the admin
-- approves (confirmed) or rejects (expired) it with
-- admin_review_manual_payment (migration 3).
-- Any PayMongo checkout still open for the booking becomes 'expired' (the
-- website has already expired it at PayMongo).
-- Takes: the booking id, the method (gcash or bpi) and the screenshot's
-- path in the bucket.
-- Gives back: the booking's new status ('awaiting_verification').
create or replace function public.submit_manual_payment(
  p_booking_id      uuid,
  p_method          public.payment_method,
  p_screenshot_path text
)
returns public.booking_status
language plpgsql
volatile
security definer  -- clients can't write payments or bookings directly
set search_path = ''
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_booking public.bookings%rowtype;
begin
  if coalesce(public.setting_text('manual_payment_enabled', 'false'), 'false') <> 'true' then
    raise exception 'Sorry, manual transfers are turned off right now. Please pay online.';
  end if;
  if p_method is null or p_method not in ('gcash', 'bpi') then
    raise exception 'Please pick GCash or BPI.';
  end if;

  -- The screenshot: in the caller's own folder, no tricks with "..", and
  -- really uploaded to the private bucket
  if p_screenshot_path is null
     or char_length(p_screenshot_path) > 300
     or position('..' in p_screenshot_path) > 0
     or left(p_screenshot_path, 37) <> v_user_id::text || '/'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'payment-screenshots' and o.name = p_screenshot_path
     )
  then
    raise exception 'Please upload a screenshot of your transfer first.';
  end if;

  -- LOCK the booking (the webhook or a second click waits here)
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  if v_booking.status <> 'pending_payment' then
    raise exception 'This booking is no longer waiting for payment.';
  end if;
  if v_booking.hold_expires_at <= now() then
    raise exception 'Sorry, your seat hold has ended. Please book the class again.';
  end if;
  if v_booking.total <= 0 then
    raise exception 'This booking is free, so there is nothing to transfer.';
  end if;

  -- The PayMongo checkout (if one was opened) can't be used any more
  update public.payments p
    set status = 'expired'
    where p.booking_id = v_booking.id
      and p.provider = 'paymongo'
      and p.status = 'pending';

  insert into public.payments (booking_id, provider, method, amount, status, screenshot_path)
  values (v_booking.id, 'manual', p_method, v_booking.total, 'pending', p_screenshot_path);

  update public.bookings b set status = 'awaiting_verification' where b.id = v_booking.id;
  return 'awaiting_verification';
end;
$$;


-- =============================================================================
-- 4. ADMIN BILLINGS
-- =============================================================================

-- The money totals at the top of the admin Payments page.
-- Only 'paid' payments count (pending, failed, expired, rejected and
-- refunded ones don't). Days, weeks and months are Philippine time; a week
-- starts on Monday.
-- Takes: nothing.
-- Gives back: one row:
--   paid_today / paid_this_week / paid_this_month    pesos received
--   payments_today                                   how many paid payments today
--   mats_this_month / mats_all_time                  pesos of mat rental (all of
--                                                    it is donated to feed strays)
--   paid_needs_action        bookings that are "paid, needs action"
--   awaiting_verification    manual transfers waiting for a check
-- The mat part of a payment is the booking's mat fee, never more than the
-- payment itself (same rule as admin_earnings in migration 10).
create or replace function public.admin_billing_summary()
returns table (
  paid_today            numeric,
  paid_this_week        numeric,
  paid_this_month       numeric,
  payments_today        integer,
  mats_this_month       numeric,
  mats_all_time         numeric,
  paid_needs_action     integer,
  awaiting_verification integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today       date := public.manila_today();
  -- Monday of this week, and the 1st of this month (Philippine dates)
  v_week_start  date := date_trunc('week', public.manila_today())::date;
  v_month_start date := date_trunc('month', public.manila_today())::date;
begin
  perform public.require_admin();

  return query
  select
    coalesce(sum(p.amount) filter (where p.paid_at >= public.at_manila(v_today, '00:00')), 0),
    coalesce(sum(p.amount) filter (where p.paid_at >= public.at_manila(v_week_start, '00:00')), 0),
    coalesce(sum(p.amount) filter (where p.paid_at >= public.at_manila(v_month_start, '00:00')), 0),
    (count(*) filter (where p.paid_at >= public.at_manila(v_today, '00:00')))::integer,
    coalesce(sum(least(b.mat_fee, p.amount)) filter (where p.paid_at >= public.at_manila(v_month_start, '00:00')), 0),
    coalesce(sum(least(b.mat_fee, p.amount)), 0),
    (select count(*)::integer from public.bookings x where x.status = 'paid_needs_action'),
    (select count(*)::integer from public.bookings x where x.status = 'awaiting_verification')
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  where p.status = 'paid';
end;
$$;


-- =============================================================================
-- Who may call what (same pattern as the earlier migrations)
-- =============================================================================

-- Take every right away first (Supabase gives all roles every new function).
revoke all on function
  public.start_online_payment(uuid),
  public.save_online_checkout(uuid, public.payment_method, text, uuid),
  public.confirm_free_booking(uuid),
  public.confirm_online_payment(text, uuid, numeric, public.payment_method, timestamptz),
  public.submit_manual_payment(uuid, public.payment_method, text),
  public.admin_billing_summary()
from public, anon, authenticated, service_role;

-- Logged-in users (each function checks the owner / admin itself).
grant execute on function
  public.start_online_payment(uuid),
  public.save_online_checkout(uuid, public.payment_method, text, uuid),
  public.confirm_free_booking(uuid),
  public.submit_manual_payment(uuid, public.payment_method, text),
  public.admin_billing_summary()
to authenticated;

-- ONLY our server's secret key. Guests and logged-in users can never call
-- it, so nobody can mark their own booking as paid from the browser.
grant execute on function
  public.confirm_online_payment(text, uuid, numeric, public.payment_method, timestamptz)
to service_role;


-- Short descriptions that show up in the Supabase dashboard.
comment on function public.start_online_payment(uuid) is 'Client: can this booking be paid online now? Gives the amount and any open PayMongo checkout.';
comment on function public.save_online_checkout(uuid, public.payment_method, text, uuid) is 'Client: save a new PayMongo checkout on their booking (a pending payment row); a double click reuses the first one.';
comment on function public.confirm_free_booking(uuid) is 'Client: confirm their own 0-peso booking (nothing to pay).';
comment on function public.confirm_online_payment(text, uuid, numeric, public.payment_method, timestamptz) is 'Server only: mark a PayMongo payment paid and confirm the booking, with the late payment rule. Safe to run twice.';
comment on function public.submit_manual_payment(uuid, public.payment_method, text) is 'Client: send a GCash / BPI transfer screenshot; the booking waits for the admin (seat kept).';
comment on function public.admin_billing_summary() is 'Admin: money paid today, this week and this month, mat rental donations, and payments needing action.';
