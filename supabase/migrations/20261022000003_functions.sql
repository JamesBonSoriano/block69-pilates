-- =============================================================================
-- Migration 3: booking functions (the business rules live here).
--
-- What this file does:
--   1. Adds small PRIVATE helpers (only other functions can call them):
--      read a setting, turn a Manila date + time into an exact moment,
--      count taken seats, check who is calling, check a voucher, check a drink.
--   2. Adds the PUBLIC functions the website calls (with supabase.rpc(...)):
--        seats_left, get_open_sessions, check_voucher, book_seat,
--        cancel_my_booking, transfer_my_booking, deactivate_my_account,
--        generate_sessions,
--        admin_walkin_booking, admin_set_attendance, admin_cancel_session,
--        admin_review_manual_payment
--   3. Adds a trigger that "spends" a voucher use when its booking gets paid.
--   4. Sets who may call which function (grants).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website calls the public functions instead of writing to the tables, so
-- the rules (seats, cutoff, prices, cancellation windows) can't be skipped.
--
-- Words used below:
--   security definer = the function runs with the OWNER's rights (the database
--                      owner), so it can write to tables that clients can't
--                      touch directly. Because of that, EVERY such function
--                      checks who is calling at the very top.
--   set search_path = '' = safety: the function only uses the exact tables and
--                      functions we name (public.xxx), so nobody can trick it
--                      with a look-alike table.
--   for update       = locks the row until our transaction ends. Anyone else who
--                      wants the same row waits in line. This is what stops two
--                      people getting the last seat.
--   raise exception  = stops the function, undoes everything it did, and sends
--                      the message back to the website (error.message).
--
-- Time note: class date / start_time / end_time are Philippine time
-- (Asia/Manila). now() is an exact moment, so we always convert the class
-- date + time to an exact moment with at_manila() before comparing.
--
-- Payment note: PayMongo confirmation (webhook) is NOT here. It comes in
-- Phase D and runs on the server with the secret key.
-- =============================================================================


-- =============================================================================
-- PART 1: PRIVATE HELPERS
-- These are locked away at the bottom of this file (no browser role may call
-- them). They don't need security definer: they only run inside the public
-- functions below, which already run with the owner's rights.
-- =============================================================================


-- Reads one setting from the settings table as plain text.
-- Takes: the setting key (e.g. 'cutoff_time') and a fallback value.
-- Gives back: the value as text (e.g. '08:00' or '500'), or the fallback if the
-- setting doesn't exist.
-- ("value #>> '{}'" pulls the plain value out of the JSON, so "08:00" and 500
-- both come back as simple text.)
create or replace function public.setting_text(p_key text, p_default text default null)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s.value #>> '{}' from public.settings s where s.key = p_key),
    p_default
  );
$$;


-- Reads one setting as a number (prices, hold minutes).
-- Takes: the setting key (e.g. 'class_price').
-- Gives back: the number, or null if the setting doesn't exist.
create or replace function public.setting_number(p_key text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select public.setting_text(p_key)::numeric;
$$;


-- Today's date in the Philippines (the server itself runs on UTC time).
-- Takes: nothing.
-- Gives back: today's date in Asia/Manila.
create or replace function public.manila_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;


-- Turns a Philippine date + clock time into one exact moment we can compare
-- with now(). Example: 2026-11-05 + 09:00 -> 2026-11-05 09:00 Manila time.
-- Takes: a date and a time (both Philippine time).
-- Gives back: the exact moment (timestamptz).
create or replace function public.at_manila(p_date date, p_time time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_date + p_time) at time zone 'Asia/Manila';
$$;


-- Works out when online booking closes for one class.
-- Rule: the cutoff time on class day (setting 'cutoff_time', default 8:00 AM),
-- or the class start time if that comes first.
-- Takes: the class date and start time.
-- Gives back: the exact moment booking closes.
create or replace function public.booking_closes_at(p_date date, p_start_time time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select least(
    public.at_manila(p_date, public.setting_text('cutoff_time', '08:00')::time),
    public.at_manila(p_date, p_start_time)
  );
$$;


-- Counts how many seats in one class are taken right now.
-- A booking takes a seat if it is:
--   - confirmed or awaiting_verification (manual transfer being checked), or
--   - attended (already marked as here, so the seat is clearly in use), or
--   - pending_payment AND its 15-minute hold hasn't ended yet.
-- Expired holds simply stop counting, so no timer is needed.
-- Takes: the class session id.
-- Gives back: the number of taken seats (0 or more).
create or replace function public.seats_taken(p_session_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.bookings b
  where b.session_id = p_session_id
    and (
      b.status in ('confirmed', 'awaiting_verification', 'attended')
      or (b.status = 'pending_payment' and b.hold_expires_at > now())
    );
$$;


-- Checks if one person already has a seat in one class (so a client can't
-- book the same class twice; friends book separately with their own accounts).
-- Takes: the user id and the class session id.
-- Gives back: the status of their seat-holding booking, or null if they have none.
create or replace function public.my_seat_status(p_user_id uuid, p_session_id uuid)
returns public.booking_status
language sql
stable
set search_path = ''
as $$
  select b.status
  from public.bookings b
  where b.user_id = p_user_id
    and b.session_id = p_session_id
    and (
      b.status in ('confirmed', 'awaiting_verification', 'attended')
      or (b.status = 'pending_payment' and b.hold_expires_at > now())
    )
  limit 1;
$$;


-- Makes sure the caller is logged in and their account is active.
-- Takes: nothing (it looks up the logged-in user with auth.uid()).
-- Gives back: the caller's user id. Stops with an error if not logged in or deactivated.
create or replace function public.require_active_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Guests have no user id.
  if v_user_id is null then
    raise exception 'Please log in first.' using errcode = '42501';
  end if;

  -- The profile must exist and be active (deactivated accounts can't book).
  if not exists (
    select 1 from public.profiles p where p.id = v_user_id and p.is_active
  ) then
    raise exception 'Your account is deactivated. Please contact the cafe.' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;


-- Makes sure the caller is an active admin.
-- Takes: nothing (uses is_admin() from migration 2).
-- Gives back: the admin's user id. Stops with an error for everyone else.
create or replace function public.require_admin()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;


-- Checks a drink choice against the options in settings ('drink_options',
-- a JSON list like ["Iced Matcha", "Iced Coffee"]).
-- Takes: the drink the client picked (can be empty).
-- Gives back: the cleaned-up drink name, or null if none was picked.
-- Stops with an error if the drink isn't on the list.
create or replace function public.check_drink_choice(p_choice text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_choice  text := nullif(btrim(p_choice), '');
  v_options jsonb;
begin
  -- No drink picked: nothing to check.
  if v_choice is null then
    return null;
  end if;

  select s.value into v_options from public.settings s where s.key = 'drink_options';

  -- Only check if the admin has set up a non-empty list.
  -- ("?" asks: is this text one of the items in the JSON list?)
  if jsonb_typeof(v_options) = 'array'
     and jsonb_array_length(v_options) > 0
     and not (v_options ? v_choice)
  then
    raise exception 'Please pick a drink from the list.';
  end if;

  return v_choice;
end;
$$;


-- Finds a voucher code and checks the caller may use it right now.
-- Checks: the code exists, it's not someone else's personal code, it hasn't
-- expired, and it still has a use left.
-- A voucher use is RESERVED while a booking that uses it is holding a seat
-- (pending_payment with a live hold, or awaiting_verification), and SPENT when
-- that booking gets paid (see the trigger in part 3). So an abandoned checkout
-- gives the use back automatically, just like the seat.
-- Takes: the typed code and the caller's user id.
-- Gives back: the whole voucher row, LOCKED until the transaction ends (so two
-- people can't grab the last use of a code at the same moment).
create or replace function public.find_usable_voucher(p_code text, p_user_id uuid)
returns public.vouchers
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_voucher  public.vouchers%rowtype;
  v_reserved integer;
begin
  -- Codes are stored in capitals; ignore spaces the client typed around it.
  select v.* into v_voucher
  from public.vouchers v
  where v.code = upper(btrim(p_code))
  for update;

  -- Not found, or it's another client's personal code. (Same message for both,
  -- so nobody can guess other people's codes.)
  if not found or (v_voucher.owner_id is not null and v_voucher.owner_id <> p_user_id) then
    raise exception 'Sorry, that voucher code isn''t valid.';
  end if;

  if v_voucher.expires_at is not null and v_voucher.expires_at <= now() then
    raise exception 'Sorry, this voucher code has expired.';
  end if;

  -- How many uses are reserved by bookings that are still waiting for payment.
  select count(*)::integer into v_reserved
  from public.bookings b
  where b.voucher_id = v_voucher.id
    and (
      b.status = 'awaiting_verification'
      or (b.status = 'pending_payment' and b.hold_expires_at > now())
    );

  if v_voucher.uses_left - v_reserved <= 0 then
    if v_reserved > 0 then
      raise exception 'This voucher code is already on another booking that is waiting for payment.';
    end if;
    raise exception 'Sorry, this voucher code has already been used.';
  end if;

  return v_voucher;
end;
$$;


-- Works out how many pesos a voucher takes off. Vouchers only ever discount
-- the CLASS FEE, never the mat rental, so the mat fee isn't even passed in.
-- Takes: the voucher row and the class fee.
-- Gives back: the discount in pesos (never more than the class fee).
create or replace function public.voucher_discount(p_voucher public.vouchers, p_class_fee numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    -- Percent codes: e.g. 50% of 500 = 250.00 (rounded to centavos).
    when p_voucher.percent_off is not null then round(p_class_fee * p_voucher.percent_off / 100, 2)
    -- Peso codes: take off that amount, but never more than the class fee.
    else least(p_voucher.amount_off, p_class_fee)
  end;
$$;


-- =============================================================================
-- PART 2: PUBLIC FUNCTIONS (called by the website)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- seats_left(session_id)
-- -----------------------------------------------------------------------------

-- Works out how many seats are still free in one class.
-- Seats left = capacity - taken seats (see seats_taken above), never below 0.
-- Takes: the class session id.
-- Gives back: a number from 0 up to the capacity (null if the session doesn't exist).
-- Guests can call this. It's security definer because guests can't read
-- bookings; it only gives back a number, never anyone's details.
create or replace function public.seats_left(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, s.capacity - public.seats_taken(s.id))
  from public.class_sessions s
  where s.id = p_session_id;
$$;


-- -----------------------------------------------------------------------------
-- get_open_sessions(from_date, to_date)
-- -----------------------------------------------------------------------------

-- Lists the classes between two dates with seats left and whether they can be
-- booked online right now. Used by Home ("Next open sessions") and booking step 1.
-- Takes: a start date and an end date (both optional; default today to 4 weeks
-- from today). Dates before today are skipped, and at most 92 days are shown.
-- Gives back: one row per class, earliest first, with:
--   seats_left        free seats right now
--   booking_closes_at when online booking closes (cutoff or class start)
--   is_bookable       true only if: status open, a seat is free, and before the cutoff
--   state             a word the page can show: 'open', 'full', 'booking_closed',
--                     'closed' (admin closed it) or 'cancelled'
create or replace function public.get_open_sessions(
  p_from_date date default null,
  p_to_date   date default null
)
returns table (
  session_id        uuid,
  date              date,
  start_time        time,
  end_time          time,
  capacity          integer,
  seats_left        integer,
  status            public.session_status,
  booking_closes_at timestamptz,
  is_bookable       boolean,
  state             text
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Work out the date range once.
  with wanted as (
    select
      greatest(coalesce(p_from_date, public.manila_today()), public.manila_today()) as from_date,
      coalesce(p_to_date, public.manila_today() + 28) as to_date
  )
  select
    s.id,
    s.date,
    s.start_time,
    s.end_time,
    s.capacity,
    x.seats_left,
    s.status,
    x.closes_at,
    -- Bookable = open + a free seat + before the cutoff.
    (s.status = 'open' and x.seats_left > 0 and now() < x.closes_at),
    -- One word for the page to show (checked in this order).
    case
      when s.status = 'cancelled' then 'cancelled'
      when s.status = 'closed'    then 'closed'
      when now() >= x.closes_at   then 'booking_closed'
      when x.seats_left = 0       then 'full'
      else 'open'
    end
  from wanted r
  join public.class_sessions s
    -- Never more than 92 days at once, so nobody can ask for years of data.
    on s.date between r.from_date and least(r.to_date, r.from_date + 92)
  -- Work out seats left and the cutoff once per class.
  cross join lateral (
    select
      greatest(0, s.capacity - public.seats_taken(s.id)) as seats_left,
      public.booking_closes_at(s.date, s.start_time)      as closes_at
  ) x
  order by s.date, s.start_time;
$$;


-- -----------------------------------------------------------------------------
-- check_voucher(code)
-- -----------------------------------------------------------------------------

-- Lets booking step 3 preview a voucher before paying ("Apply" button).
-- It does NOT reserve or use the code; book_seat checks it again when paying.
-- Takes: the typed code.
-- Gives back: the code, its percent or peso discount, how many pesos it takes
-- off the current class fee, and when it expires.
-- Stops with a plain-English error if the code can't be used.
create or replace function public.check_voucher(p_code text)
returns table (
  code        text,
  percent_off numeric,
  amount_off  numeric,
  discount    numeric,
  expires_at  timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id   uuid := public.require_active_user();
  v_voucher   public.vouchers%rowtype;
  v_class_fee numeric := public.setting_number('class_price');
begin
  if v_class_fee is null then
    raise exception 'Sorry, the class price isn''t set up yet. Please contact the cafe.';
  end if;

  v_voucher := public.find_usable_voucher(p_code, v_user_id);

  return query select
    v_voucher.code,
    v_voucher.percent_off,
    v_voucher.amount_off,
    public.voucher_discount(v_voucher, v_class_fee),
    v_voucher.expires_at;
end;
$$;


-- -----------------------------------------------------------------------------
-- book_seat(...)  - THE MAIN ONE
-- -----------------------------------------------------------------------------

-- Holds a seat for the logged-in client when they click Pay (booking step 3).
-- Everything happens in ONE locked step, so two people can never get the last seat:
--   1. check the caller is logged in and active
--   2. check the not-pregnant box and the agreement are ticked
--   3. LOCK the class row (anyone else booking this class waits here)
--   4. check the class is open, it's before the cutoff, the client isn't
--      already booked in it, and a seat is free
--   5. read prices and hold minutes from settings, apply the voucher (class fee only)
--   6. save the booking as 'pending_payment' with a hold (default 15 minutes)
-- Takes: the class id, the two required ticks, and the booking details from steps 2-3
-- (mat rental, drink, first time, health notes, optional voucher code).
-- The client's name, mobile and email live in their profile, which the page
-- saves separately.
-- Gives back: the new booking id, the price breakdown and when the hold ends.
-- The server uses the total from HERE for PayMongo, never a total from the browser.
create or replace function public.book_seat(
  p_session_id   uuid,
  p_not_pregnant boolean,
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

  -- 2. Required ticks (the table also refuses a booking without them).
  if not coalesce(p_not_pregnant, false) then
    raise exception 'Please confirm that you are not pregnant. This class is not suitable during pregnancy.';
  end if;
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
  v_hold_until := now() + make_interval(mins => coalesce(public.setting_number('hold_minutes'), 15)::integer);

  insert into public.bookings (
    session_id, user_id, status, mat_rental, drink_choice, voucher_id,
    class_fee, mat_fee, discount, total,
    first_time, health_notes, not_pregnant_confirmed, agreed_at, hold_expires_at
  )
  values (
    v_session.id, v_user_id, 'pending_payment', coalesce(p_mat_rental, false), v_drink, v_voucher.id,
    v_class_fee, v_mat_fee, v_discount, v_class_fee + v_mat_fee - v_discount,
    coalesce(p_first_time, false), v_notes, true, now(), v_hold_until
  )
  returning id into v_booking_id;

  return query select
    v_booking_id, v_class_fee, v_mat_fee, v_discount,
    v_class_fee + v_mat_fee - v_discount, v_hold_until;
end;
$$;


-- -----------------------------------------------------------------------------
-- cancel_my_booking(booking_id)
-- -----------------------------------------------------------------------------

-- Cancels one of the caller's confirmed bookings, following the cancellation
-- table in CLAUDE.md section 5:
--   more than 24h before class -> refused: use Transfer instead
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
  v_time_left  interval;
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

  -- If the cafe cancelled the class, the client gets a free transfer instead.
  if v_session.status = 'cancelled' then
    raise exception 'The cafe cancelled this class, so you can move to another class for free. Please use Transfer instead.';
  end if;

  -- How long until class starts.
  v_time_left := public.at_manila(v_session.date, v_session.start_time) - now();

  if v_time_left <= interval '0' then
    raise exception 'This class has already started, so it can''t be cancelled.';

  elsif v_time_left > interval '24 hours' then
    -- More than 24h: transfer instead. (If it was already transferred once,
    -- explain when they CAN cancel.)
    if v_booking.transferred_from is not null then
      raise exception 'This booking was already transferred once, so it can''t be moved again. You can cancel it from 24 hours before class and get a 50%% voucher.';
    end if;
    raise exception 'Your class is more than 24 hours away, so please use Transfer to move to another class instead of cancelling.';

  elsif v_time_left >= interval '12 hours' then
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
    -- Less than 12h: cancelled with no credit.
    update public.bookings b set status = 'forfeited' where b.id = v_booking.id;
    return query select 'forfeited'::public.booking_status, null::text, null::timestamptz;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- transfer_my_booking(booking_id, new_session_id)
-- -----------------------------------------------------------------------------

-- Moves one of the caller's confirmed bookings to another class.
-- Normal rules: more than 24h before the old class, and only once per booking
-- (a booking that came from a transfer can't be transferred again).
-- If the CAFE cancelled the old class, those two rules are skipped (free transfer).
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

  -- Normal transfer rules (skipped if the cafe cancelled the old class).
  if v_old.status <> 'cancelled' then
    if v_booking.transferred_from is not null then
      raise exception 'This booking was already transferred once. A booking can only be transferred one time.';
    end if;
    if public.at_manila(v_old.date, v_old.start_time) - now() <= interval '24 hours' then
      raise exception 'Transfers are only allowed more than 24 hours before class.';
    end if;
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
-- deactivate_my_account()
-- -----------------------------------------------------------------------------

-- Lets a client deactivate their own account (My Profile > Deactivate account).
-- Needed because the trigger from migration 2 blocks clients from changing
-- is_active directly. Only an admin can reactivate the account later.
-- Their bookings are left as they are.
-- Takes: nothing (uses the logged-in user).
-- Gives back: nothing.
create or replace function public.deactivate_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Please log in first.' using errcode = '42501';
  end if;

  -- This runs with the owner's rights, so the role/is_active trigger lets it through.
  update public.profiles p set is_active = false where p.id = v_user_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- generate_sessions(weeks)
-- -----------------------------------------------------------------------------

-- Creates the dated classes from the active weekly templates, from today up to
-- N weeks ahead. Classes that already exist (same date + start time) are
-- skipped, so it's safe to run again and again (the nightly job will do that).
-- Who may run it: an admin from the website, or trusted server code / pg_cron
-- (these have no logged-in user). Guests can't call it at all (see grants).
-- Takes: how many weeks ahead (1 to 12, default 4).
-- Gives back: how many new classes were created.
create or replace function public.generate_sessions(p_weeks integer default 4)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today   date := public.manila_today();
  v_created integer;
begin
  -- A logged-in user must be an admin. (No user = server code or pg_cron.)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;

  if p_weeks is null or p_weeks not between 1 and 12 then
    raise exception 'Please pick between 1 and 12 weeks.';
  end if;

  -- Every day from today for N weeks, matched with the templates for that
  -- weekday (0 = Sunday ... 6 = Saturday, same as the template's weekday).
  insert into public.class_sessions (template_id, date, start_time, end_time, capacity)
  select t.id, d.day::date, t.start_time, t.end_time, t.default_capacity
  -- (::timestamp = plain date/time with no time zone, so the server's own UTC
  -- clock can't shift the days.)
  from generate_series(v_today::timestamp, (v_today + (p_weeks * 7 - 1))::timestamp, interval '1 day') as d(day)
  join public.schedule_templates t
    on t.is_active
   and t.weekday = extract(dow from d.day)
  -- Already there? Skip it (unique date + start_time from migration 1).
  on conflict (date, start_time) do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_walkin_booking(...)
-- -----------------------------------------------------------------------------

-- Admin books a seat for someone at the counter (Walk-in booking page).
-- It takes a seat exactly like an online booking (same lock and seat check),
-- but ignores the online cutoff (walk-ins happen on class day) and saves the
-- booking as 'confirmed' right away with a 'paid' payment.
-- Takes: the class id, guest name and contact, how they paid ('cash', 'gcash'
-- or 'bpi'), the two ticks confirmed in person, and the optional extras
-- (mat, drink, first time, health notes).
-- Gives back: the new booking id, the payment id and the total paid.
create or replace function public.admin_walkin_booking(
  p_session_id     uuid,
  p_name           text,
  p_contact        text,
  p_payment_method public.payment_method,
  p_not_pregnant   boolean,
  p_agreed         boolean,
  p_mat_rental     boolean default false,
  p_drink_choice   text    default null,
  p_first_time     boolean default false,
  p_health_notes   text    default null
)
returns table (
  booking_id uuid,
  payment_id uuid,
  total      numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin_id   uuid := public.require_admin();
  v_name       text := nullif(btrim(p_name), '');
  v_contact    text := nullif(btrim(p_contact), '');
  v_session    public.class_sessions%rowtype;
  v_class_fee  numeric(10, 2);
  v_mat_fee    numeric(10, 2) := 0;
  v_drink      text;
  v_booking_id uuid;
  v_payment_id uuid;
begin
  if v_name is null then
    raise exception 'Please enter the guest''s name.';
  end if;
  if v_contact is null then
    raise exception 'Please enter the guest''s contact number.';
  end if;
  if not coalesce(p_not_pregnant, false) then
    raise exception 'Please confirm the guest is not pregnant.';
  end if;
  if not coalesce(p_agreed, false) then
    raise exception 'Please confirm the guest agreed to the Registration Agreement.';
  end if;
  -- Walk-ins pay cash at the counter, or by GCash / BPI transfer.
  if p_payment_method is null or p_payment_method not in ('cash', 'gcash', 'bpi') then
    raise exception 'Walk-in payments must be cash, GCash or BPI.';
  end if;

  -- LOCK the class row (same as book_seat), so walk-ins and online bookings
  -- can never overbook together.
  select s.* into v_session
  from public.class_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Sorry, we couldn''t find that class.';
  end if;
  if v_session.status <> 'open' then
    raise exception 'This class is not open (it''s closed or cancelled).';
  end if;
  if now() >= public.at_manila(v_session.date, v_session.end_time) then
    raise exception 'This class has already ended.';
  end if;
  if public.seats_taken(v_session.id) >= v_session.capacity then
    raise exception 'Sorry, this class is full.';
  end if;

  -- Prices from settings.
  v_class_fee := public.setting_number('class_price');
  if v_class_fee is null then
    raise exception 'The class price isn''t set up yet (Settings).';
  end if;
  if coalesce(p_mat_rental, false) then
    v_mat_fee := public.setting_number('mat_price');
    if v_mat_fee is null then
      raise exception 'The mat rental price isn''t set up yet (Settings).';
    end if;
  end if;

  v_drink := public.check_drink_choice(p_drink_choice);

  insert into public.bookings (
    session_id, walkin_name, walkin_contact, status, mat_rental, drink_choice,
    class_fee, mat_fee, discount, total,
    first_time, health_notes, not_pregnant_confirmed, agreed_at
  )
  values (
    v_session.id, v_name, v_contact, 'confirmed', coalesce(p_mat_rental, false), v_drink,
    v_class_fee, v_mat_fee, 0, v_class_fee + v_mat_fee,
    coalesce(p_first_time, false), nullif(btrim(p_health_notes), ''), true, now()
  )
  returning id into v_booking_id;

  -- Record the money as received, and which admin took it.
  -- Cash -> provider 'cash'. GCash/BPI transfer -> provider 'manual'.
  insert into public.payments (booking_id, provider, method, amount, status, verified_by, paid_at)
  values (
    v_booking_id,
    case when p_payment_method = 'cash' then 'cash' else 'manual' end::public.payment_provider,
    p_payment_method,
    v_class_fee + v_mat_fee,
    'paid',
    v_admin_id,
    now()
  )
  returning id into v_payment_id;

  return query select v_booking_id, v_payment_id, v_class_fee + v_mat_fee;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_set_attendance(booking_id, status)
-- -----------------------------------------------------------------------------

-- Admin marks a guest as attended or no-show (Attendance list / Bookings).
-- Only confirmed bookings can be marked, and a mistake can be fixed by marking
-- an attended/no-show booking again. Only on or after the class day.
-- Takes: the booking id and 'attended' or 'no_show'.
-- Gives back: the new status.
create or replace function public.admin_set_attendance(
  p_booking_id uuid,
  p_status     public.booking_status
)
returns public.booking_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_booking  public.bookings%rowtype;
  v_date     date;
begin
  if p_status is null or p_status not in ('attended', 'no_show') then
    raise exception 'Attendance can only be set to attended or no-show.';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  if v_booking.status not in ('confirmed', 'attended', 'no_show') then
    raise exception 'Only confirmed bookings can be marked attended or no-show.';
  end if;

  select s.date into v_date from public.class_sessions s where s.id = v_booking.session_id;
  if v_date > public.manila_today() then
    raise exception 'You can only mark attendance on or after the class day.';
  end if;

  update public.bookings b set status = p_status where b.id = v_booking.id;
  return p_status;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_cancel_session(session_id)
-- -----------------------------------------------------------------------------

-- Admin cancels one class (for example the instructor is sick).
-- The class becomes 'cancelled'. Its bookings are LEFT AS THEY ARE, so booked
-- clients can use Transfer for free (transfer_my_booking skips the 24h and
-- once-only rules for cancelled classes).
-- Takes: the class session id.
-- Gives back: how many bookings were holding a seat in it (people to notify).
create or replace function public.admin_cancel_session(p_session_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := public.require_admin();
  v_status   public.session_status;
begin
  -- Lock the class so nobody books it while we cancel it.
  select s.status into v_status
  from public.class_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Sorry, we couldn''t find that class.';
  end if;
  if v_status = 'cancelled' then
    raise exception 'This class is already cancelled.';
  end if;

  update public.class_sessions s set status = 'cancelled' where s.id = p_session_id;

  return public.seats_taken(p_session_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_review_manual_payment(payment_id, approve)
-- -----------------------------------------------------------------------------

-- Admin checks a manual GCash/BPI transfer screenshot (backup payment method).
--   approve = true  -> payment 'paid', booking 'confirmed' (the seat was held, so it's theirs)
--   approve = false -> payment 'rejected', booking 'expired' (the seat is freed)
-- Takes: the payment id and true (approve) or false (reject).
-- Gives back: the booking's new status.
create or replace function public.admin_review_manual_payment(p_payment_id uuid, p_approve boolean)
returns public.booking_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id   uuid := public.require_admin();
  v_payment    public.payments%rowtype;
  v_booking    public.bookings%rowtype;
  v_new_status public.booking_status;
begin
  if p_approve is null then
    raise exception 'Please choose approve or reject.';
  end if;

  select p.* into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found then
    raise exception 'Sorry, we couldn''t find that payment.';
  end if;
  if v_payment.provider <> 'manual' then
    raise exception 'Only manual transfer payments need to be reviewed.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'This payment was already reviewed.';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_payment.booking_id
  for update;

  if v_booking.status <> 'awaiting_verification' then
    raise exception 'This booking is not waiting for a payment check.';
  end if;

  if p_approve then
    update public.payments p
      set status = 'paid', paid_at = now(), verified_by = v_admin_id
      where p.id = v_payment.id;
    v_new_status := 'confirmed';
  else
    update public.payments p
      set status = 'rejected', verified_by = v_admin_id
      where p.id = v_payment.id;
    v_new_status := 'expired';
  end if;

  update public.bookings b set status = v_new_status where b.id = v_booking.id;
  return v_new_status;
end;
$$;


-- =============================================================================
-- PART 3: TRIGGER - spend a voucher use when its booking gets paid
-- =============================================================================

-- Takes 1 off a voucher's uses_left when a booking that uses it becomes paid
-- ('confirmed' or 'paid_needs_action'). While the booking was only waiting for
-- payment, the use was just reserved (see find_usable_voucher).
-- Transferred bookings (transferred_from is set) are skipped, because the
-- voucher was already spent on the original booking.
-- Works no matter who confirms the booking: an admin, a function, or the
-- PayMongo webhook in Phase D.
-- Takes: the new (and old) booking row from Postgres.
-- Gives back: nothing useful (it's an "after" trigger).
create or replace function public.spend_voucher_on_payment()
returns trigger
language plpgsql
security definer  -- the client confirming via a function can't edit vouchers directly
set search_path = ''
as $$
begin
  if new.voucher_id is not null
     and new.transferred_from is null
     and new.status in ('confirmed', 'paid_needs_action')
     -- Only the FIRST time it becomes paid (a new paid row, or coming from an unpaid status).
     and (tg_op = 'INSERT' or old.status in ('pending_payment', 'awaiting_verification', 'expired'))
  then
    -- greatest(..., 0): never go below zero, even for a very late payment.
    update public.vouchers v
      set uses_left = greatest(v.uses_left - 1, 0)
      where v.id = new.voucher_id;
  end if;
  return null;
end;
$$;

create trigger bookings_spend_voucher
  after insert or update of status on public.bookings
  for each row execute function public.spend_voucher_on_payment();


-- =============================================================================
-- PART 4: WHO MAY CALL WHAT (grants)
-- Supabase lets every role call new functions by default, so we first take
-- that away from everyone, then give back only what each role needs.
-- =============================================================================

-- Private helpers and the trigger function: nobody calls these directly.
-- (Our public functions still can, because they run with the owner's rights.)
revoke all on function
  public.setting_text(text, text),
  public.setting_number(text),
  public.manila_today(),
  public.at_manila(date, time),
  public.booking_closes_at(date, time),
  public.seats_taken(uuid),
  public.my_seat_status(uuid, uuid),
  public.require_active_user(),
  public.require_admin(),
  public.check_drink_choice(text),
  public.find_usable_voucher(text, uuid),
  public.voucher_discount(public.vouchers, numeric),
  public.spend_voucher_on_payment()
from public, anon, authenticated, service_role;

-- Start the public functions from zero too.
revoke all on function
  public.seats_left(uuid),
  public.get_open_sessions(date, date),
  public.check_voucher(text),
  public.book_seat(uuid, boolean, boolean, boolean, text, boolean, text, text),
  public.cancel_my_booking(uuid),
  public.transfer_my_booking(uuid, uuid),
  public.deactivate_my_account(),
  public.generate_sessions(integer),
  public.admin_walkin_booking(uuid, text, text, public.payment_method, boolean, boolean, boolean, text, boolean, text),
  public.admin_set_attendance(uuid, public.booking_status),
  public.admin_cancel_session(uuid),
  public.admin_review_manual_payment(uuid, boolean)
from public, anon, authenticated, service_role;

-- Guests and everyone: see classes and seats left.
grant execute on function
  public.seats_left(uuid),
  public.get_open_sessions(date, date)
to anon, authenticated, service_role;

-- Logged-in users only. (Each function also checks the user itself, and the
-- admin_* ones check is_admin() inside.)
grant execute on function
  public.check_voucher(text),
  public.book_seat(uuid, boolean, boolean, boolean, text, boolean, text, text),
  public.cancel_my_booking(uuid),
  public.transfer_my_booking(uuid, uuid),
  public.deactivate_my_account(),
  public.admin_walkin_booking(uuid, text, text, public.payment_method, boolean, boolean, boolean, text, boolean, text),
  public.admin_set_attendance(uuid, public.booking_status),
  public.admin_cancel_session(uuid),
  public.admin_review_manual_payment(uuid, boolean)
to authenticated;

-- Creating sessions: admins (logged in) and server code / pg_cron.
grant execute on function public.generate_sessions(integer) to authenticated, service_role;


-- Short descriptions that show up in the Supabase dashboard.
comment on function public.seats_left(uuid) is 'Free seats in one class right now (capacity minus seat-holding bookings).';
comment on function public.get_open_sessions(date, date) is 'Classes in a date range with seats left and whether they can be booked online now.';
comment on function public.check_voucher(text) is 'Preview a voucher code for the logged-in client (does not reserve it).';
comment on function public.book_seat(uuid, boolean, boolean, boolean, text, boolean, text, text) is 'Holds a seat (pending_payment) in one locked step: seat check, cutoff, prices, voucher.';
comment on function public.cancel_my_booking(uuid) is 'Client cancels a confirmed booking: 12-24h = 50% voucher, under 12h = forfeited, over 24h = refused (transfer).';
comment on function public.transfer_my_booking(uuid, uuid) is 'Client moves a confirmed booking to another class: over 24h before, once only (free if the cafe cancelled).';
comment on function public.deactivate_my_account() is 'Client deactivates their own account.';
comment on function public.generate_sessions(integer) is 'Creates dated classes from active templates for N weeks ahead, skipping existing ones.';
comment on function public.admin_walkin_booking(uuid, text, text, public.payment_method, boolean, boolean, boolean, text, boolean, text) is 'Admin: walk-in booking with a paid cash/GCash/BPI payment.';
comment on function public.admin_set_attendance(uuid, public.booking_status) is 'Admin: mark a booking attended or no_show.';
comment on function public.admin_cancel_session(uuid) is 'Admin: cancel a class; bookings stay so clients can transfer for free.';
comment on function public.admin_review_manual_payment(uuid, boolean) is 'Admin: approve or reject a manual transfer payment.';
