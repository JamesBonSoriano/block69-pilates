-- =============================================================================
-- Migration 15: Change 17, Part F - booking changes
-- (docs/prompts/17-client-revisions-2.md).
--
-- What this file does:
--   1. NO MORE "I am not pregnant" TICK for online bookings. The proposal
--      removed the checkbox from booking step 2, so the database rule changes
--      with it (not worked around in the page code):
--        - the bookings check now only requires the Registration Agreement
--          (agreed_at). Before it also required not_pregnant_confirmed.
--        - not_pregnant_confirmed becomes OPTIONAL: null = "not asked" (new
--          online bookings). Old bookings keep their saved answer, and the
--          admin walk-in still records its in-person check (the admin side
--          doesn't change, so admin_walkin_booking() is left as it is).
--        - book_seat() is replaced by a version WITHOUT the p_not_pregnant
--          input. Everything else in it is exactly the same (the one locked
--          step: seat check, cutoff, one seat per person, prices from
--          settings, voucher on the class fee only, the 15-minute hold).
--      The class is still "not suitable for pregnant participants": that line
--      is in the Health and Safety text on Home.
--   2. CLASSES 9 WEEKS AHEAD. Booking step 1 now shows this month AND next
--      month. On the 1st of a month, the end of next month is up to 61 days
--      away, so 9 weeks (63 days) of classes are needed. The private setting
--      sessions_weeks_ahead goes from 4 to 9 (only if it is still 4), and
--      generate_sessions(9) runs once now (it skips classes that already
--      exist). Until the nightly job (Phase E) exists, the admin keeps it
--      topped up with "Create classes" (9 weeks) on the Schedule page.
--   3. THE NEW REGISTRATION AGREEMENT text (booking/agreement), only if it is
--      still migration 4's draft (an admin's own wording is kept). It is now
--      paragraphs, not a numbered list. Its last line says
--      {facebook_link} / {instagram_link}: the website turns these into links
--      to the Facebook and Instagram pages in Settings.
--
-- SAFE TO RUN TWICE (the test runs it again): "if exists" / "or replace",
-- and the updates only touch values that are still the old ones.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website calls book_seat() from holdSeat() (src/lib/booking/actions.ts).
-- Tests: supabase/tests/17-r2-booking.test.mjs (and the updated 03, 10, 16).
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- =============================================================================
-- 1. NO "NOT PREGNANT" TICK
-- =============================================================================

-- The old rule: not-pregnant AND the agreement. The new rule: the agreement only.
-- ("if exists" + dropping the new one first = safe to run twice)
alter table public.bookings drop constraint if exists bookings_health_and_agreement;
alter table public.bookings drop constraint if exists bookings_agreement_required;
alter table public.bookings
  add constraint bookings_agreement_required check (agreed_at is not null);

-- null = not asked (online bookings from Change 17 on); true = confirmed
-- (older online bookings, and walk-ins checked in person at the counter).
alter table public.bookings alter column not_pregnant_confirmed drop not null;
alter table public.bookings alter column not_pregnant_confirmed drop default;
comment on column public.bookings.not_pregnant_confirmed is
  'true = the not-pregnant check was confirmed (older online bookings, walk-ins); null = not asked (online bookings since Change 17).';

-- The old book_seat() had p_not_pregnant as its 2nd input. A function's
-- inputs can't be changed in place, so the old one is removed first.
drop function if exists public.book_seat(uuid, boolean, boolean, boolean, text, boolean, text, text);

-- Holds a seat for the logged-in client when they confirm booking step 2.
-- Everything happens in ONE locked step, so two people can never get the last seat:
--   1. check the caller is logged in and active
--   2. check the Registration Agreement is ticked
--   3. LOCK the class row (anyone else booking this class waits here)
--   4. check the class is open, it's before the cutoff, the client isn't
--      already booked in it, and a seat is free
--   5. read prices and hold minutes from settings, apply the voucher (class fee only)
--   6. save the booking as 'pending_payment' with a hold (default 15 minutes)
-- Takes: the class id, the agreement tick, and the booking details (mat
-- rental, drink, first time, health notes, optional voucher code).
-- Gives back: the new booking id, the price breakdown and when the hold ends.
-- The server uses the total from HERE for PayMongo, never a total from the browser.
create or replace function public.book_seat(
  p_session_id   uuid,
  p_agreed       boolean,
  p_mat_rental   boolean default false,
  p_drink_choice text    default null,
  p_first_time   boolean default false,
  p_health_notes text    default null,
  p_voucher_code text    default null
)
returns table (
  booking_id      uuid,
  class_fee       numeric,
  mat_fee         numeric,
  discount        numeric,
  total           numeric,
  hold_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id    uuid;
  v_session    public.class_sessions%rowtype;
  v_closes_at  timestamptz;
  v_my_status  public.booking_status;
  v_voucher    public.vouchers%rowtype;
  v_class_fee  numeric(10, 2);
  v_mat_fee    numeric(10, 2) := 0;
  v_discount   numeric(10, 2) := 0;
  v_drink      text;
  v_notes      text := nullif(btrim(p_health_notes), '');
  v_hold_until timestamptz;
  v_booking_id uuid;
begin
  -- 1. Who is calling?
  v_user_id := public.require_active_user();

  -- 2. The Registration Agreement must be ticked (the table refuses a booking
  --    without it too).
  if not coalesce(p_agreed, false) then
    raise exception 'Please tick the Registration Agreement to continue.';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'Please keep your health notes under 1000 characters.';
  end if;

  -- 3. LOCK the class row. From here until the end of this function, anyone
  --    else booking this same class waits, so the seat count below is exact.
  select s.* into v_session
  from public.class_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Sorry, we couldn''t find that class.';
  end if;

  -- 4a. The class must be open.
  if v_session.status = 'cancelled' then
    raise exception 'Sorry, this class was cancelled.';
  elsif v_session.status <> 'open' then
    raise exception 'Sorry, this class is closed for booking.';
  end if;

  -- 4b. Before the cutoff (default 8:00 AM on class day).
  v_closes_at := public.booking_closes_at(v_session.date, v_session.start_time);
  if now() >= v_closes_at then
    raise exception 'Sorry, online booking for this class closed at % on class day.',
      to_char(v_closes_at at time zone 'Asia/Manila', 'FMHH12:MI AM');
  end if;

  -- 4c. One seat per person per class.
  v_my_status := public.my_seat_status(v_user_id, v_session.id);
  if v_my_status = 'pending_payment' then
    raise exception 'You already have a seat on hold for this class. Please finish paying, or try again after the hold ends.';
  elsif v_my_status is not null then
    raise exception 'You already have a booking for this class.';
  end if;

  -- 4d. A seat must be free.
  if public.seats_taken(v_session.id) >= v_session.capacity then
    raise exception 'Sorry, this class is full.';
  end if;

  -- 5a. Prices always come from settings, never from the browser.
  v_class_fee := public.setting_number('class_price');
  if v_class_fee is null then
    raise exception 'Sorry, the class price isn''t set up yet. Please contact the cafe.';
  end if;
  if coalesce(p_mat_rental, false) then
    v_mat_fee := public.setting_number('mat_price');
    if v_mat_fee is null then
      raise exception 'Sorry, the mat rental price isn''t set up yet. Please contact the cafe.';
    end if;
  end if;

  -- 5b. Drink must be one of the options in settings.
  v_drink := public.check_drink_choice(p_drink_choice);

  -- 5c. Voucher (optional). Discounts the CLASS FEE only, never the mat.
  if nullif(btrim(p_voucher_code), '') is not null then
    v_voucher  := public.find_usable_voucher(p_voucher_code, v_user_id);
    v_discount := public.voucher_discount(v_voucher, v_class_fee);
  end if;

  -- 6. Save the booking with a seat hold (setting 'hold_minutes', default 15).
  --    not_pregnant_confirmed is left empty: the question isn't asked online
  --    any more (Change 17).
  v_hold_until := now() + make_interval(mins => coalesce(public.setting_number('hold_minutes'), 15)::integer);

  insert into public.bookings (
    session_id, user_id, status, mat_rental, drink_choice, voucher_id,
    class_fee, mat_fee, discount, total,
    first_time, health_notes, not_pregnant_confirmed, agreed_at, hold_expires_at
  )
  values (
    v_session.id, v_user_id, 'pending_payment', coalesce(p_mat_rental, false), v_drink, v_voucher.id,
    v_class_fee, v_mat_fee, v_discount, v_class_fee + v_mat_fee - v_discount,
    coalesce(p_first_time, false), v_notes, null, now(), v_hold_until
  )
  returning id into v_booking_id;

  return query select
    v_booking_id, v_class_fee, v_mat_fee, v_discount,
    v_class_fee + v_mat_fee - v_discount, v_hold_until;
end;
$$;

-- Who may call it: logged-in users only (the same as the old version).
-- (Supabase gives every role every new function, so take it all away first.)
revoke all on function public.book_seat(uuid, boolean, boolean, text, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.book_seat(uuid, boolean, boolean, text, boolean, text, text)
  to authenticated;
comment on function public.book_seat(uuid, boolean, boolean, text, boolean, text, text) is
  'Holds a seat (pending_payment) in one locked step: agreement, seat check, cutoff, prices, voucher.';


-- =============================================================================
-- 2. CLASSES 9 WEEKS AHEAD
-- =============================================================================

-- The private "weeks ahead" setting (shown on the admin Settings page),
-- only if it is still the starting value 4 (saved as the number 4, or as the
-- text "4" if the admin pressed Save without changing it)
update public.settings
set value = to_jsonb(9)
where key = 'sessions_weeks_ahead'
  and value in (to_jsonb(4), to_jsonb('4'::text));

-- Make the classes now: from today (Philippine time) for 9 weeks. Classes
-- that already exist are skipped. (No one is logged in while a migration
-- runs, so the function treats it like trusted server code.)
select public.generate_sessions(9);


-- =============================================================================
-- 3. THE NEW REGISTRATION AGREEMENT
-- =============================================================================

-- Only if it's still migration 4's draft (\r is removed before comparing, in
-- case the text was saved with Windows line endings). One paragraph per line.
update public.site_content
set body = E'By submitting this registration form and completing your payment, you acknowledge that you have read, understood, and agreed to all of the class policies, including the booking and cancellation terms, health and safety requirements, and liability waiver.\n'
        || E'You confirm that you are participating voluntarily, are physically able to join the class, and accept full responsibility for your participation. You release the instructor, Block 69 Cafe, its staff, partners, and organizers from any liability for injuries, accidents, illnesses, or losses that may occur during or as a result of participating in the class, except where required by law.\n'
        || E'Your registration and payment serve as your acceptance of these terms and conditions.\n'
        || E'You may also reach us through our social media accounts {facebook_link} / {instagram_link}: @block69cafe'
where page = 'booking'
  and section = 'agreement'
  and replace(body, E'\r', '') = E'I confirm that I am not pregnant.\n'
        || E'I have told Block 69 Cafe about any injuries or medical conditions, and I join the class at my own risk.\n'
        || E'I will follow the instructor''s guidance, and I will stop and tell the instructor if I feel pain or discomfort.\n'
        || E'I have read and accept the cancellation policy.\n'
        || E'Block 69 Cafe may contact me by email or phone about my booking.';
