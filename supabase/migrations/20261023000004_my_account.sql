-- =============================================================================
-- Migration 8: My Account pages (Phase C, Step 10).
--
-- What this file does:
--   1. Adds a PRIVATE helper, change_rule(), that says what the cancellation
--      table (CLAUDE.md section 5) means for one booking RIGHT NOW:
--      transfer, 50% voucher, no credit, already started, ...
--      cancel_my_booking() and transfer_my_booking() (migration 3) are
--      rewritten to use it, with exactly the same rules and messages as
--      before. My Bookings uses the SAME helper to explain what Cancel will
--      do, so the explanation and the real cancel can never disagree.
--   2. Adds three read-only functions for the My Account pages. Each one only
--      ever gives back the CALLER's own rows:
--        get_my_bookings()           My Bookings (Upcoming and Past)
--        get_my_payments(payment_id) Payments, and one payment's receipt
--        get_my_vouchers()           My Vouchers (personal codes only)
--   3. Adds a private helper, booking_moved_to(), that follows a booking
--      FORWARD through its transfers (the opposite of booking_family() from
--      migration 6).
--
-- Why new functions instead of reading the tables directly:
--   Row Level Security (migration 2) lets ADMINS read every client's
--   bookings, payments and vouchers. If My Account read the tables directly,
--   an admin opening their own My Account would see everybody's. These
--   functions always filter on auth.uid() (the logged-in person), so
--   everyone, admins included, sees only their own.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website calls the functions from src/lib/data/account.ts and
-- src/lib/account/actions.ts.
--
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- change_rule(date, start_time, session_status, transferred_from)   PRIVATE
-- -----------------------------------------------------------------------------

-- Works out what the cancellation rules allow for one booking right now.
-- It only looks at the class and the clock; the caller checks that the
-- booking is 'confirmed' first.
-- Takes: the class date and start time (Philippine time), the class status,
-- and the booking's transferred_from (empty if it was never moved).
-- Gives back one word:
--   'free_transfer'        the CAFE cancelled the class: free transfer, any time
--   'started'              the class has already started: nothing can change
--   'transfer'             more than 24h before class: transfer (no cancel)
--   'already_transferred'  more than 24h before, but this booking came from a
--                          transfer: no second transfer, and no cancel yet
--   'voucher'              12 to 24h before class: cancel gives a 50% code
--   'no_credit'            less than 12h before class: cancel gives nothing
create or replace function public.change_rule(
  p_date             date,
  p_start_time       time,
  p_session_status   public.session_status,
  p_transferred_from uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  -- time_left = how long until the class starts (negative once it has started)
  select case
    when p_session_status = 'cancelled' then 'free_transfer'
    when x.time_left <= interval '0' then 'started'
    when x.time_left > interval '24 hours' then
      case when p_transferred_from is null then 'transfer' else 'already_transferred' end
    when x.time_left >= interval '12 hours' then 'voucher'
    else 'no_credit'
  end
  from (select public.at_manila(p_date, p_start_time) - now() as time_left) x;
$$;


-- -----------------------------------------------------------------------------
-- booking_moved_to(booking_id)   PRIVATE
-- -----------------------------------------------------------------------------

-- Follows a booking FORWARD through its transfers, to the booking that holds
-- the seat now. Example: A was moved to B, and B (its class was cancelled by
-- the cafe) was moved to C. booking_moved_to(A) = C.
-- Why: a payment stays on the ORIGINAL booking, so the Payments page uses
-- this to say "moved to Sat 1 Nov".
-- Takes: a booking id.
-- Gives back: the id of the LAST booking in the chain, or null if the booking
-- was never transferred.
create or replace function public.booking_moved_to(p_booking_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  -- "with recursive" = start with one booking, then keep adding the booking
  -- that was made FROM it (transferred_from points back to the older one).
  with recursive chain (id, depth) as (
    select p_booking_id, 0
    union all
    -- (depth < 20 is only a safety stop; a real chain is 1 to 3 long)
    select b.id, c.depth + 1
    from chain c
    join public.bookings b on b.transferred_from = c.id
    where c.depth < 20
  )
  select chain.id
  from chain
  where chain.depth > 0      -- not the booking itself
  order by chain.depth desc  -- the newest one in the chain
  limit 1;
$$;


-- -----------------------------------------------------------------------------
-- cancel_my_booking(booking_id)   REWRITTEN to use change_rule()
-- -----------------------------------------------------------------------------

-- Lets a client cancel one of their own CONFIRMED bookings.
-- The rules are exactly the same as in migration 3 (and the same messages):
--   cafe cancelled the class   -> refused: use the free Transfer
--   class already started      -> refused
--   more than 24h before class -> refused: use Transfer (or, if already
--                                 transferred once, wait until 24h before)
--   12 to 24h before class     -> 'cancelled_with_voucher' + a personal 50% code
--                                 (class fee only, valid 60 days, one use)
--   less than 12h before class -> 'forfeited' (no credit; the page warns first)
-- Takes: the booking id.
-- Gives back: the new status, plus the voucher code and its expiry (both empty
-- when forfeited).
create or replace function public.cancel_my_booking(p_booking_id uuid)
returns table (
  new_status         public.booking_status,
  voucher_code       text,
  voucher_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id    uuid := public.require_active_user();
  v_booking    public.bookings%rowtype;
  v_session    public.class_sessions%rowtype;
  v_rule       text;
  v_code       text;
  v_expires_at timestamptz;
begin
  -- Lock the booking so it can't be cancelled and transferred at the same time.
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  -- Not found, or not the caller's booking (same message, so nobody can poke
  -- around other people's bookings).
  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed bookings can be cancelled.';
  end if;

  select s.* into v_session from public.class_sessions s where s.id = v_booking.session_id;

  -- What do the rules say right now? (The same helper My Bookings uses.)
  v_rule := public.change_rule(v_session.date, v_session.start_time, v_session.status, v_booking.transferred_from);

  if v_rule = 'free_transfer' then
    raise exception 'The cafe cancelled this class, so you can move to another class for free. Please use Transfer instead.';

  elsif v_rule = 'started' then
    raise exception 'This class has already started, so it can''t be cancelled.';

  elsif v_rule = 'already_transferred' then
    raise exception 'This booking was already transferred once, so it can''t be moved again. You can cancel it from 24 hours before class and get a 50%% voucher.';

  elsif v_rule = 'transfer' then
    raise exception 'Your class is more than 24 hours away, so please use Transfer to move to another class instead of cancelling.';

  elsif v_rule = 'voucher' then
    -- 12 to 24h: cancel and give a personal 50% code.
    -- Make a random code like HALF-3F9A1C. If it happens to exist already
    -- (very unlikely), try another one.
    loop
      v_code := 'HALF-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      begin
        insert into public.vouchers (code, percent_off, owner_id, source, uses_left, expires_at)
        values (v_code, 50, v_user_id, 'cancellation', 1, now() + interval '60 days')
        returning expires_at into v_expires_at;
        exit;  -- saved, leave the loop
      exception when unique_violation then
        -- that code is taken, loop and try a new one
      end;
    end loop;

    update public.bookings b set status = 'cancelled_with_voucher' where b.id = v_booking.id;
    return query select 'cancelled_with_voucher'::public.booking_status, v_code, v_expires_at;

  else
    -- 'no_credit' (less than 12h): cancelled with no credit.
    update public.bookings b set status = 'forfeited' where b.id = v_booking.id;
    return query select 'forfeited'::public.booking_status, null::text, null::timestamptz;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- transfer_my_booking(booking_id, new_session_id)   REWRITTEN to use change_rule()
-- -----------------------------------------------------------------------------

-- Moves one of the caller's confirmed bookings to another class.
-- The rules are exactly the same as in migration 3 (and the same messages):
-- more than 24h before the old class, and only once per booking. If the CAFE
-- cancelled the old class, those two rules are skipped (free transfer).
-- The new class must be open, before its cutoff, have a free seat, and the
-- client must not already be in it.
-- The old booking becomes 'transferred'. A new 'confirmed' booking is made with
-- the same inclusions and amounts (mat, drink, voucher, fees, health answers)
-- and points back to the old one (transferred_from). No new payment.
-- Takes: the booking id and the new class session id.
-- Gives back: the new booking's id.
create or replace function public.transfer_my_booking(p_booking_id uuid, p_new_session_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id     uuid := public.require_active_user();
  v_booking     public.bookings%rowtype;
  v_old         public.class_sessions%rowtype;
  v_new         public.class_sessions%rowtype;
  v_rule        text;
  v_new_booking uuid;
begin
  -- Lock the booking so it can't be cancelled and transferred at the same time.
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;

  if v_booking.status = 'transferred' then
    raise exception 'This booking has already been transferred.';
  elsif v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed bookings can be transferred.';
  end if;

  if p_new_session_id = v_booking.session_id then
    raise exception 'Please pick a different class.';
  end if;

  -- LOCK both classes. Always lock in the same order (smallest id first), so
  -- two transfers going opposite ways can't get stuck waiting for each other.
  perform 1
  from public.class_sessions s
  where s.id in (v_booking.session_id, p_new_session_id)
  order by s.id
  for update;

  select s.* into v_old from public.class_sessions s where s.id = v_booking.session_id;
  select s.* into v_new from public.class_sessions s where s.id = p_new_session_id;

  if v_new.id is null then
    raise exception 'Sorry, we couldn''t find the class you picked.';
  end if;

  -- May this booking be moved? Only 'transfer' (more than 24h, never moved
  -- before) or 'free_transfer' (the cafe cancelled the class).
  v_rule := public.change_rule(v_old.date, v_old.start_time, v_old.status, v_booking.transferred_from);
  if v_rule not in ('transfer', 'free_transfer') then
    if v_booking.transferred_from is not null then
      raise exception 'This booking was already transferred once. A booking can only be transferred one time.';
    end if;
    raise exception 'Transfers are only allowed more than 24 hours before class.';
  end if;

  -- The new class must be bookable.
  if v_new.status <> 'open' then
    raise exception 'Sorry, the class you picked is not open for booking.';
  end if;
  if now() >= public.booking_closes_at(v_new.date, v_new.start_time) then
    raise exception 'Sorry, booking for the class you picked has already closed.';
  end if;
  if public.my_seat_status(v_user_id, v_new.id) is not null then
    raise exception 'You already have a booking for the class you picked.';
  end if;
  if public.seats_taken(v_new.id) >= v_new.capacity then
    raise exception 'Sorry, the class you picked is full.';
  end if;

  -- Old booking gives up its seat.
  update public.bookings b set status = 'transferred' where b.id = v_booking.id;

  -- New booking: same inclusions and amounts, already paid, so 'confirmed'.
  -- (Payments stay linked to the old booking; transferred_from connects them.)
  insert into public.bookings (
    session_id, user_id, status, mat_rental, drink_choice, voucher_id,
    class_fee, mat_fee, discount, total,
    first_time, health_notes, not_pregnant_confirmed, agreed_at, transferred_from
  )
  values (
    v_new.id, v_user_id, 'confirmed', v_booking.mat_rental, v_booking.drink_choice, v_booking.voucher_id,
    v_booking.class_fee, v_booking.mat_fee, v_booking.discount, v_booking.total,
    v_booking.first_time, v_booking.health_notes, v_booking.not_pregnant_confirmed, v_booking.agreed_at,
    v_booking.id
  )
  returning id into v_new_booking;

  return v_new_booking;
end;
$$;


-- -----------------------------------------------------------------------------
-- get_my_bookings()
-- -----------------------------------------------------------------------------

-- Lists the logged-in client's own bookings for My Bookings.
-- Left out on purpose: unpaid holds that ran out or were given up ('expired',
-- or 'pending_payment' after hold_expires_at). They never became bookings, and
-- every "Change details" click would otherwise add one to the list.
-- Takes: nothing (uses the logged-in user).
-- Gives back: one row per booking, earliest class first, with:
--   the booking and its class (date, times, class status, drink, mat, total),
--   hold_seconds_left      seconds left on an unpaid hold (0 otherwise)
--   moved_from_date/_time  the class it was transferred FROM (empty if none)
--   moved_to_date/_time    the class it was transferred TO (empty if none)
--   paid_amount/_method    the latest PAID payment for it, or for the booking
--                          it was transferred from (empty if none yet)
--   is_upcoming            true = show under "Upcoming": it still holds a seat
--                          in a class that hasn't ended, OR the cafe cancelled
--                          its class and the free transfer hasn't been used yet
--   change_rule            for 'confirmed' bookings only: what Cancel / Transfer
--                          means right now (see change_rule above); else empty
--   can_transfer           true if transfer_my_booking() would allow a move now
-- Admins get only THEIR OWN bookings here too. Guests can't call it.
create or replace function public.get_my_bookings()
returns table (
  booking_id            uuid,
  status                public.booking_status,
  session_id            uuid,
  class_date            date,
  start_time            time,
  end_time              time,
  session_status        public.session_status,
  mat_rental            boolean,
  drink_choice          text,
  total                 numeric,
  hold_seconds_left     integer,
  moved_from_date       date,
  moved_from_start_time time,
  moved_to_date         date,
  moved_to_start_time   time,
  paid_amount           numeric,
  paid_method           public.payment_method,
  is_upcoming           boolean,
  change_rule           text,
  can_transfer          boolean,
  created_at            timestamptz
)
language sql
stable
security definer  -- needs the private helpers (booking_family, change_rule)
set search_path = ''
as $$
  select
    b.id,
    b.status,
    s.id,
    s.date,
    s.start_time,
    s.end_time,
    s.status,
    b.mat_rental,
    b.drink_choice,
    b.total,
    -- Seconds left on an unpaid hold, rounded up (same as get_my_booking)
    case
      when b.status = 'pending_payment' and b.hold_expires_at > now()
        then ceil(extract(epoch from b.hold_expires_at - now()))::integer
      else 0
    end,
    from_s.date,
    from_s.start_time,
    to_s.date,
    to_s.start_time,
    pay.amount,
    pay.method,
    -- Upcoming?
    (
      -- The cafe cancelled the class: the client is owed a free transfer, so
      -- keep it in view (even after the class date) until they use it.
      (b.status = 'confirmed' and s.status = 'cancelled')
      or (
        -- Otherwise: still holding a seat (or paid and waiting for the cafe),
        -- and the class hasn't ended yet.
        public.at_manila(s.date, s.end_time) > now()
        and (
          b.status in ('confirmed', 'awaiting_verification', 'paid_needs_action')
          or (b.status = 'pending_payment' and b.hold_expires_at > now())
        )
      )
    ),
    rule.value,
    coalesce(rule.value in ('transfer', 'free_transfer'), false),
    b.created_at
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  -- The class it was moved FROM (one step back)
  left join public.bookings from_b on from_b.id = b.transferred_from
  left join public.class_sessions from_s on from_s.id = from_b.session_id
  -- The class it was moved TO (one step forward; a booking is only moved once
  -- at a time, so there is at most one)
  left join public.bookings to_b on to_b.transferred_from = b.id
  left join public.class_sessions to_s on to_s.id = to_b.session_id
  -- The latest paid payment for this booking or the ones it came from
  left join lateral (
    select p.amount, p.method
    from public.payments p
    where p.booking_id in (select public.booking_family(b.id))
      and p.status = 'paid'
    order by p.paid_at desc
    limit 1
  ) pay on true
  -- The cancel / transfer rule, only for confirmed bookings
  left join lateral (
    select public.change_rule(s.date, s.start_time, s.status, b.transferred_from) as value
    where b.status = 'confirmed'
  ) rule on true
  where b.user_id = auth.uid()  -- SECURITY: only the caller's own bookings
    and b.status <> 'expired'
    and not (b.status = 'pending_payment' and b.hold_expires_at <= now())
  order by s.date, s.start_time, b.created_at;
$$;


-- -----------------------------------------------------------------------------
-- get_my_payments(payment_id)
-- -----------------------------------------------------------------------------

-- Lists the logged-in client's own payments (Payments page), or just one of
-- them (its receipt page).
-- A payment belongs to the client if its booking is theirs. After a transfer
-- the payment stays on the ORIGINAL booking, which is still theirs, so it is
-- listed once, with the class it was paid for AND where the booking is now.
-- Takes: a payment id, or nothing (null) for all of them.
-- Gives back: one row per payment, newest first, with:
--   the payment (provider, method, amount, status, PayMongo reference, paid_at,
--     created_at),
--   the booking it paid for (id, class date and times, drink, mat, the saved
--     class_fee / mat_fee / discount / total, and the voucher code if any;
--     the code is shown only because it's on the caller's own booking),
--   now_date / now_start_time / now_end_time: the class the booking was
--     moved to (empty if it was never transferred).
-- Admins get only THEIR OWN payments here too. Guests can't call it.
create or replace function public.get_my_payments(p_payment_id uuid default null)
returns table (
  payment_id     uuid,
  provider       public.payment_provider,
  method         public.payment_method,
  amount         numeric,
  status         public.payment_status,
  paymongo_ref   text,
  paid_at        timestamptz,
  created_at     timestamptz,
  booking_id     uuid,
  class_date     date,
  start_time     time,
  end_time       time,
  drink_choice   text,
  mat_rental     boolean,
  class_fee      numeric,
  mat_fee        numeric,
  discount       numeric,
  total          numeric,
  voucher_code   text,
  now_date       date,
  now_start_time time,
  now_end_time   time
)
language sql
stable
security definer  -- needs booking_moved_to(), and shows the booking's own voucher code
set search_path = ''
as $$
  select
    p.id,
    p.provider,
    p.method,
    p.amount,
    p.status,
    p.paymongo_ref,
    p.paid_at,
    p.created_at,
    b.id,
    s.date,
    s.start_time,
    s.end_time,
    b.drink_choice,
    b.mat_rental,
    b.class_fee,
    b.mat_fee,
    b.discount,
    b.total,
    v.code,
    now_s.date,
    now_s.start_time,
    now_s.end_time
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  join public.class_sessions s on s.id = b.session_id
  left join public.vouchers v on v.id = b.voucher_id
  -- Where the booking is now, if it was transferred
  left join public.bookings now_b on now_b.id = public.booking_moved_to(b.id)
  left join public.class_sessions now_s on now_s.id = now_b.session_id
  where b.user_id = auth.uid()  -- SECURITY: only the caller's own payments
    and (p_payment_id is null or p.id = p_payment_id)
  order by coalesce(p.paid_at, p.created_at) desc;
$$;


-- -----------------------------------------------------------------------------
-- get_my_vouchers()
-- -----------------------------------------------------------------------------

-- Lists the logged-in client's PERSONAL voucher codes (My Vouchers), such as
-- the 50% codes from cancelling 12 to 24h before class.
-- Promo codes (no owner, e.g. WELCOME10) are NEVER listed, and neither is
-- anyone else's code: only vouchers whose owner is the caller.
-- Takes: nothing (uses the logged-in user).
-- Gives back: one row per voucher, with its state:
--   'active'    can be used on the next booking
--   'reserved'  its last use is on an unpaid booking right now (it comes back
--               if that hold runs out; see find_usable_voucher in migration 3)
--   'used'      no uses left
--   'expired'   past its expiry date (and not used)
-- used_for_date = the date of the class it was used on (empty if not used).
-- Order: active first (soonest to expire first), then reserved, used, expired.
-- It runs with the CALLER's rights (no security definer): RLS already limits
-- it to rows they may read, and the owner filter limits it to their own.
create or replace function public.get_my_vouchers()
returns table (
  voucher_id    uuid,
  code          text,
  percent_off   numeric,
  amount_off    numeric,
  source        public.voucher_source,
  uses_left     integer,
  expires_at    timestamptz,
  created_at    timestamptz,
  state         text,
  used_for_date date
)
language sql
stable
set search_path = ''
as $$
  select
    v.id,
    v.code,
    v.percent_off,
    v.amount_off,
    v.source,
    v.uses_left,
    v.expires_at,
    v.created_at,
    x.state,
    used.date
  from public.vouchers v
  -- How many uses are held by unpaid bookings right now (same rule as
  -- find_usable_voucher in migration 3)
  cross join lateral (
    select count(*)::integer as reserved
    from public.bookings b
    where b.voucher_id = v.id
      and (
        b.status = 'awaiting_verification'
        or (b.status = 'pending_payment' and b.hold_expires_at > now())
      )
  ) r
  -- The voucher's state (checked in this order)
  cross join lateral (
    select case
      when v.uses_left <= 0 then 'used'
      when v.expires_at is not null and v.expires_at <= now() then 'expired'
      when v.uses_left - r.reserved <= 0 then 'reserved'
      else 'active'
    end as state
  ) x
  -- The class it was spent on: the latest ORIGINAL booking (not a transfer
  -- copy) that got paid with it
  left join lateral (
    select s.date
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.voucher_id = v.id
      and b.transferred_from is null
      and b.status not in ('pending_payment', 'awaiting_verification', 'expired')
    order by b.created_at desc
    limit 1
  ) used on x.state = 'used'
  where v.owner_id = auth.uid()  -- SECURITY: only the caller's own codes (never promos)
  order by
    case x.state when 'active' then 1 when 'reserved' then 2 when 'used' then 3 else 4 end,
    -- active codes: the one running out soonest first; the rest: newest first
    case when x.state = 'active' then v.expires_at end asc nulls last,
    v.created_at desc;
$$;


-- -----------------------------------------------------------------------------
-- Who may call what (same pattern as migrations 3, 6 and 7)
-- -----------------------------------------------------------------------------

-- Take every right away first (Supabase gives all roles every new function).
-- ("create or replace" keeps the old grants of cancel_my_booking and
-- transfer_my_booking, so they don't need to be set again.)
revoke all on function
  public.change_rule(date, time, public.session_status, uuid),
  public.booking_moved_to(uuid),
  public.get_my_bookings(),
  public.get_my_payments(uuid),
  public.get_my_vouchers()
from public, anon, authenticated, service_role;

-- The private helpers stay locked. The three page functions: logged-in users only.
grant execute on function
  public.get_my_bookings(),
  public.get_my_payments(uuid),
  public.get_my_vouchers()
to authenticated;


-- Short descriptions that show up in the Supabase dashboard.
comment on function public.change_rule(date, time, public.session_status, uuid) is 'Private: what Cancel / Transfer means for a booking right now (free_transfer, started, transfer, already_transferred, voucher, no_credit).';
comment on function public.booking_moved_to(uuid) is 'Private: the newest booking a booking was transferred to (null if never moved).';
comment on function public.get_my_bookings() is 'The caller''s own bookings for My Bookings, with upcoming flag, cancel/transfer rule, transfer links and payment.';
comment on function public.get_my_payments(uuid) is 'The caller''s own payments (or one of them, for a receipt), with the class paid for and where it was moved.';
comment on function public.get_my_vouchers() is 'The caller''s own personal voucher codes with their state (active, reserved, used, expired). Never promo codes.';
