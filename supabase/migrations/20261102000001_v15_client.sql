-- =============================================================================
-- Migration 21: Version 1.5, client side.
--
-- What this file does:
--   1. Classes run THURSDAY TO SATURDAY only (C5, C6):
--        - the two Sunday weekly templates are switched off, so "Open classes
--          for booking" never makes Sunday classes again
--        - future Sunday classes with NO bookings at all are deleted
--        - future Sunday classes WITH bookings are cancelled the normal way
--          (status 'cancelled'): the booked clients get the "class cancelled"
--          notice and a free move, like any class the cafe cancels.
--          Nothing that has bookings is deleted.
--        - the About Us cafe text "From Thursday to Sunday mornings" becomes
--          "Thursday to Saturday", only if nobody has edited it
--   2. A RESCHEDULING WINDOW for classes the cafe cancels (C8):
--        - class_sessions.cancelled_at: when the class was cancelled (stamped
--          by a trigger every time a class becomes 'cancelled')
--        - setting reschedule_window_days (default 30, admin can change it)
--        - free_move_last_day(): the last day a free move can be made =
--          the cancellation day or the class day (whichever is LATER), plus
--          the window. So cancelling a class weeks ahead never shrinks it.
--        - transfer_my_booking() refuses a free move after that day
--        - get_my_bookings() gives back move_by (the last day) and the new
--          rule word 'move_window_ended' (no move offered, shown under Past)
--        - get_my_notifications() gives back move_by, so the bell can say
--          "Move by Nov 30"
--        - admin_update_settings() accepts reschedule_window_days (1 to 365)
--      After the window: no voucher and no refund. The cafe can still make
--      an exception from the admin booking page (cancel with a reason).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: /book, Home, About Us (class days), My Bookings
-- (src/components/account/BookingCard.tsx), the transfer page, the bell
-- (src/lib/notifications.ts) and admin Settings.
-- Tests: supabase/tests/23-v15-client.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. class_sessions.cancelled_at + the trigger that stamps it
-- =============================================================================
-- (Added first, so the Sunday classes cancelled in part 3 get stamped too.)

-- When the cafe cancelled this class. Empty while it's open or closed.
alter table public.class_sessions
  add column if not exists cancelled_at timestamptz;

comment on column public.class_sessions.cancelled_at is 'When the class was cancelled (empty unless status = cancelled). Starts the free-move window.';

-- Classes cancelled before this column existed: their last change is the
-- best guess for when they were cancelled.
update public.class_sessions
set cancelled_at = updated_at
where status = 'cancelled' and cancelled_at is null;

-- Stamps cancelled_at whenever a class becomes cancelled, and clears it if
-- the class is opened (or closed) again.
-- Takes: the new (and for an update, the old) class_sessions row.
-- Gives back: the row to save.
create or replace function public.stamp_class_cancelled_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' then
    -- Keep a time that's already there (cancelled before, or given in the
    -- same statement); otherwise it was cancelled just now.
    new.cancelled_at := coalesce(new.cancelled_at, now());
  else
    new.cancelled_at := null;
  end if;
  return new;
end;
$$;

-- Runs before a class is added or its status changes.
drop trigger if exists class_sessions_stamp_cancelled_at on public.class_sessions;
create trigger class_sessions_stamp_cancelled_at
  before insert or update of status on public.class_sessions
  for each row execute function public.stamp_class_cancelled_at();


-- =============================================================================
-- 2. The window setting + free_move_last_day()
-- =============================================================================

-- How many days a client has to use the free move after the cafe cancels
-- their class. Public (the website may show it). Kept if it already exists.
insert into public.settings (key, value, is_public)
values ('reschedule_window_days', to_jsonb(30), true)
on conflict (key) do nothing;

-- The last day (Philippine date) a client may still move a booking for free
-- after the cafe cancelled its class.
-- Rule: the LATER of the cancellation day and the class day, plus the
-- reschedule_window_days setting (30 if it's missing). The move works until
-- the end of that day.
-- Takes: when the class was cancelled (empty = now) and the class date.
-- Gives back: the last day, e.g. 2026-11-30.
create or replace function public.free_move_last_day(p_cancelled_at timestamptz, p_class_date date)
returns date
language sql
stable
set search_path = ''
as $$
  select greatest((coalesce(p_cancelled_at, now()) at time zone 'Asia/Manila')::date, p_class_date)
         + coalesce(public.setting_number('reschedule_window_days'), 30)::integer;
$$;


-- =============================================================================
-- 3. Thursday to Saturday only
-- =============================================================================

-- The weekly pattern: Sunday (weekday 0) switched off. The rows stay, so the
-- admin can switch Sunday back on from the Schedule page if ever needed.
update public.schedule_templates
set is_active = false
where weekday = 0 and is_active;

-- Future Sunday classes with NO bookings at all (in any status): deleted.
-- (They were only made by "Open classes for booking" and nobody used them.)
delete from public.class_sessions s
where s.date >= public.manila_today()
  and extract(dow from s.date) = 0
  and not exists (select 1 from public.bookings b where b.session_id = s.id);

-- Future Sunday classes that DO have bookings: cancelled the normal way.
-- The triggers then tell everyone holding a seat (notify_class_cancelled)
-- and stamp cancelled_at, so they get the free move and its window.
update public.class_sessions s
set status = 'cancelled'
where s.date >= public.manila_today()
  and extract(dow from s.date) = 0
  and s.status <> 'cancelled';

-- About Us, the cafe text: only if it still has the words from migration 4
-- (an edited text is left alone).
update public.site_content
set body = replace(body, 'From Thursday to Sunday mornings', 'From Thursday to Saturday mornings')
where page = 'about'
  and section = 'cafe'
  and body like '%From Thursday to Sunday mornings%';


-- =============================================================================
-- 4. admin_update_settings(), now with reschedule_window_days
-- =============================================================================

-- Same as migration 10 (saves settings after checking each value), plus:
--   reschedule_window_days  whole number, 1 to 365 (days to use a free move
--                           after the cafe cancels a class)
-- See migration 10 for the other keys and their rules.
-- Takes: a JSON object of setting key -> new value.
-- Gives back: how many settings were saved.
create or replace function public.admin_update_settings(p_values jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key   text;
  v_value jsonb;
  v_clean jsonb;     -- the value that is saved
  v_text  text;
  v_num   numeric;
  v_label text;      -- the setting's name in messages
  v_count integer := 0;
begin
  perform public.require_admin();

  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'There is nothing to save.';
  end if;

  for v_key, v_value in select e.key, e.value from jsonb_each(p_values) e loop
    -- A friendly name for messages
    v_label := case v_key
      when 'class_price' then 'The class price'
      when 'mat_price' then 'The mat rental price'
      when 'hold_minutes' then 'The seat hold'
      when 'cutoff_time' then 'The booking cutoff'
      when 'sessions_weeks_ahead' then 'Weeks ahead'
      when 'reschedule_window_days' then 'The rescheduling window'
      when 'drink_options' then 'The drink list'
      when 'cafe_name' then 'The cafe name'
      when 'cafe_address' then 'The address'
      when 'cafe_email' then 'The contact email'
      when 'admin_alert_email' then 'The alert email'
      when 'cafe_phone' then 'The phone number'
      when 'gcash_name' then 'The GCash account name'
      when 'gcash_number' then 'The GCash number'
      when 'bpi_account_name' then 'The BPI account name'
      when 'bpi_account_number' then 'The BPI account number'
      when 'maps_url' then 'The map link'
      when 'instagram_url' then 'The Instagram link'
      when 'facebook_url' then 'The Facebook link'
      when 'chat_url' then 'The Chat With Us link'
      else initcap(replace(v_key, '_', ' '))
    end;

    case
      -- ---- Money ----
      when v_key in ('class_price', 'mat_price') then
        if jsonb_typeof(v_value) <> 'number' then
          raise exception '% must be a number of pesos.', v_label;
        end if;
        v_num := (v_value #>> '{}')::numeric;
        if v_num <> round(v_num, 2) then
          raise exception '% can have at most 2 decimals.', v_label;
        end if;
        if v_num > 100000 or v_num < (case when v_key = 'class_price' then 1 else 0 end) then
          raise exception '% must be between % and 100,000 pesos.', v_label,
            case when v_key = 'class_price' then 1 else 0 end;
        end if;
        v_clean := to_jsonb(v_num);

      -- ---- Whole numbers ----
      when v_key in ('hold_minutes', 'sessions_weeks_ahead', 'reschedule_window_days') then
        if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric) then
          raise exception '% must be a whole number.', v_label;
        end if;
        v_num := (v_value #>> '{}')::numeric;
        if v_key = 'hold_minutes' and v_num not between 5 and 60 then
          raise exception 'The seat hold must be between 5 and 60 minutes.';
        end if;
        if v_key = 'sessions_weeks_ahead' and v_num not between 1 and 12 then
          raise exception 'Weeks ahead must be between 1 and 12.';
        end if;
        -- NEW (Version 1.5)
        if v_key = 'reschedule_window_days' and v_num not between 1 and 365 then
          raise exception 'The rescheduling window must be between 1 and 365 days.';
        end if;
        v_clean := to_jsonb(v_num::integer);

      -- ---- The cutoff time ----
      when v_key = 'cutoff_time' then
        v_text := btrim(v_value #>> '{}');
        if jsonb_typeof(v_value) <> 'string' or v_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'The booking cutoff must be a time like 08:00.';
        end if;
        v_clean := to_jsonb(v_text);

      -- ---- On / off ----
      when v_key = 'manual_payment_enabled' then
        if jsonb_typeof(v_value) <> 'boolean' then
          raise exception 'The manual transfer switch must be on or off.';
        end if;
        v_clean := v_value;

      -- ---- The drink list ----
      when v_key = 'drink_options' then
        if jsonb_typeof(v_value) <> 'array' then
          raise exception 'The drink list must be a list of names.';
        end if;
        if exists (select 1 from jsonb_array_elements(v_value) d where jsonb_typeof(d) <> 'string') then
          raise exception 'Each drink must be a name.';
        end if;
        -- Clean every name, keep the admin's order
        select coalesce(jsonb_agg(x.name order by x.n), '[]'::jsonb) into v_clean
        from (
          select btrim(d.value) as name, d.n
          from jsonb_array_elements_text(v_value) with ordinality as d(value, n)
          where btrim(d.value) <> ''
        ) x;
        if jsonb_array_length(v_clean) not between 1 and 12 then
          raise exception 'Please keep between 1 and 12 drinks on the list.';
        end if;
        if exists (select 1 from jsonb_array_elements_text(v_clean) d where length(d) > 40) then
          raise exception 'Each drink name can be at most 40 characters.';
        end if;
        if (select count(distinct lower(d)) from jsonb_array_elements_text(v_clean) d) <> jsonb_array_length(v_clean) then
          raise exception 'The drink list has the same drink twice.';
        end if;

      -- ---- Text ----
      when v_key in ('cafe_name', 'cafe_address', 'cafe_email', 'admin_alert_email',
                     'cafe_phone', 'gcash_name', 'gcash_number', 'bpi_account_name', 'bpi_account_number') then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception '% must be text.', v_label;
        end if;
        v_text := btrim(v_value #>> '{}');
        if v_key in ('cafe_name', 'cafe_address', 'cafe_email', 'admin_alert_email') and v_text = '' then
          raise exception '% can''t be empty.', v_label;
        end if;
        if length(v_text) > (case when v_key = 'cafe_address' then 200 else 80 end) then
          raise exception '% is too long.', v_label;
        end if;
        if v_key in ('cafe_email', 'admin_alert_email') and v_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
          raise exception '% must be an email address.', v_label;
        end if;
        v_clean := to_jsonb(v_text);

      -- ---- Web links ----
      when v_key in ('maps_url', 'instagram_url', 'facebook_url', 'chat_url') then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception '% must be a web address.', v_label;
        end if;
        v_text := btrim(v_value #>> '{}');
        -- Empty is allowed (the website then hides that link)
        if v_text <> '' and (v_text !~ '^https://[^[:space:]]+$' or length(v_text) > 300) then
          raise exception '% must be a web address starting with https://', v_label;
        end if;
        v_clean := to_jsonb(v_text);

      else
        raise exception 'Unknown setting: %', v_key;
    end case;

    -- Save it. A missing row is made again (public, except the two admin-only
    -- settings). An existing row keeps its is_public as it is.
    insert into public.settings (key, value, is_public)
    values (v_key, v_clean, v_key not in ('admin_alert_email', 'sessions_weeks_ahead'))
    on conflict (key) do update set value = excluded.value;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


-- =============================================================================
-- 5. transfer_my_booking(), with the window
-- =============================================================================

-- Same as migration 19 (moves one of the caller's confirmed or late-paid
-- bookings to another class), plus ONE new rule:
--   a free move because the cafe cancelled the class ('free_transfer') only
--   works until free_move_last_day(). After that it's refused.
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
  v_last_day    date;
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
  elsif v_booking.status not in ('confirmed', 'paid_needs_action') then
    raise exception 'Only confirmed bookings can be transferred.';
  end if;

  -- A late payment may only be moved if the money that came in covers the
  -- booking total. (Otherwise the cafe sorts it out.)
  if v_booking.status = 'paid_needs_action' and not public.booking_paid_enough(v_booking.id) then
    raise exception 'Your payment doesn''t match the booking total, so this booking can''t be moved here. The cafe will contact you to sort it out.';
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
  -- before), 'free_transfer' (the cafe cancelled the class) or
  -- 'late_payment' (paid after the hold ended: a free move at any time).
  if v_booking.status = 'paid_needs_action' then
    v_rule := 'late_payment';
  else
    v_rule := public.change_rule(v_old.date, v_old.start_time, v_old.status, v_booking.transferred_from);
  end if;
  if v_rule not in ('transfer', 'free_transfer', 'late_payment') then
    if v_booking.transferred_from is not null then
      raise exception 'This booking was already transferred once. A booking can only be transferred one time.';
    end if;
    raise exception 'Transfers are only allowed more than 24 hours before class.';
  end if;

  -- NEW (Version 1.5): the free move after a cafe cancellation has a window.
  if v_rule = 'free_transfer' then
    v_last_day := public.free_move_last_day(v_old.cancelled_at, v_old.date);
    if public.manila_today() > v_last_day then
      raise exception 'The time to move this booking ended on %. Please message the cafe with Chat With Us.',
        to_char(v_last_day, 'FMMon FMDD, YYYY');
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


-- =============================================================================
-- 6. get_my_bookings(), with move_by and 'move_window_ended'
-- =============================================================================

-- The return columns change (new: move_by), so the old function is dropped
-- first. Its rights are given back at the end of this file.
drop function if exists public.get_my_bookings();

-- Same as migration 19 (the logged-in client's own bookings for My
-- Bookings), plus for a confirmed booking in a class the CAFE cancelled:
--   move_by       the last day to move it for free (free_move_last_day)
--   change_rule   'free_transfer' until then; 'move_window_ended' after it
--   can_transfer  false once the window has ended
--   is_upcoming   false once the window has ended (it moves to Past)
-- Takes: nothing (uses the logged-in user). Gives back: one row per booking.
create function public.get_my_bookings()
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
  created_at            timestamptz,
  move_by               date
)
language sql
stable
security definer  -- needs the private helpers (booking_family, change_rule...)
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
      -- The cafe cancelled the class: the client is owed a free move, so keep
      -- it in view (even after the class date) until they use it, or until
      -- the window ends (NEW).
      (b.status = 'confirmed' and s.status = 'cancelled' and rule.value = 'free_transfer')
      -- A late payment is owed a free move too, at any time
      or b.status = 'paid_needs_action'
      or (
        -- Otherwise: still holding a seat (or paid and waiting for the cafe),
        -- and the class hasn't ended yet. (A confirmed booking in a cancelled
        -- class is only upcoming through the first line above, so once its
        -- window ends it moves to Past.)
        not (b.status = 'confirmed' and s.status = 'cancelled')
        and public.at_manila(s.date, s.end_time) > now()
        and (
          b.status in ('confirmed', 'awaiting_verification', 'paid_needs_action')
          or (b.status = 'pending_payment' and b.hold_expires_at > now())
        )
      )
    ),
    rule.value,
    -- can_transfer: the same checks as transfer_my_booking()
    coalesce(
      rule.value in ('transfer', 'free_transfer')
        or (rule.value = 'late_payment' and public.booking_paid_enough(b.id)),
      false
    ),
    b.created_at,
    rule.move_by
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  -- The class it was moved FROM (one step back)
  left join public.bookings from_b on from_b.id = b.transferred_from
  left join public.class_sessions from_s on from_s.id = from_b.session_id
  -- The class it was moved TO (one step forward)
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
  -- The last day of the free move, for a confirmed booking in a cancelled class
  left join lateral (
    select public.free_move_last_day(s.cancelled_at, s.date) as day
    where b.status = 'confirmed' and s.status = 'cancelled'
  ) window_end on true
  -- The cancel / transfer rule (confirmed and late-paid bookings only)
  left join lateral (
    select
      case
        when b.status = 'paid_needs_action' then 'late_payment'
        -- NEW: the cafe cancelled the class and the window is over
        when window_end.day is not null and public.manila_today() > window_end.day then 'move_window_ended'
        else public.change_rule(s.date, s.start_time, s.status, b.transferred_from)
      end as value,
      window_end.day as move_by
    where b.status in ('confirmed', 'paid_needs_action')
  ) rule on true
  where b.user_id = auth.uid()  -- SECURITY: only the caller's own bookings
    and b.status <> 'expired'
    and not (b.status = 'pending_payment' and b.hold_expires_at <= now())
  order by s.date, s.start_time, b.created_at;
$$;


-- =============================================================================
-- 7. get_my_notifications(), with move_by
-- =============================================================================

-- New column, so drop and make it again (rights given back below).
drop function if exists public.get_my_notifications(integer);

-- Same as migration 13 (the caller's own updates, newest first, with the
-- class each one is about), plus:
--   move_by  for a "class cancelled" update: the last day to move for free
-- It now runs with the owner's rights (security definer) because
-- free_move_last_day() is private. It still only ever gives back the
-- caller's OWN rows (where n.user_id = auth.uid()).
-- Takes: how many to give back (1 to 100, default 50).
-- Gives back: one row per update.
create function public.get_my_notifications(p_limit integer default 50)
returns table (
  id           uuid,
  kind         public.notification_kind,
  voucher_code text,
  created_at   timestamptz,
  read_at      timestamptz,
  booking_id   uuid,
  class_date   date,
  start_time   time,
  end_time     time,
  move_by      date
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.voucher_code, n.created_at, n.read_at, n.booking_id,
         s.date, s.start_time, s.end_time,
         case
           when n.kind = 'class_cancelled' and s.status = 'cancelled'
             then public.free_move_last_day(s.cancelled_at, s.date)
         end
  from public.notifications n
  left join public.bookings b on b.id = n.booking_id
  left join public.class_sessions s on s.id = b.session_id
  where n.user_id = auth.uid()  -- SECURITY: only the caller's own updates
  order by n.created_at desc, n.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;


-- =============================================================================
-- Who may call what
-- =============================================================================

-- Private: the trigger function and the window helper.
revoke all on function
  public.stamp_class_cancelled_at(),
  public.free_move_last_day(timestamptz, date)
from public, anon, authenticated, service_role;

-- The two remade page functions: logged-in users only (as before).
revoke all on function
  public.get_my_bookings(),
  public.get_my_notifications(integer)
from public, anon, authenticated, service_role;
grant execute on function
  public.get_my_bookings(),
  public.get_my_notifications(integer)
to authenticated;

-- Short descriptions that show up in the Supabase dashboard.
comment on function public.stamp_class_cancelled_at() is 'Trigger: stamps class_sessions.cancelled_at when a class becomes cancelled (clears it if reopened).';
comment on function public.free_move_last_day(timestamptz, date) is 'Private: last day to move a booking for free after the cafe cancelled its class (later of cancel day / class day + reschedule_window_days).';
comment on function public.transfer_my_booking(uuid, uuid) is 'Client moves a confirmed booking (over 24h before, once; free if the cafe cancelled, within the rescheduling window) or a late-paid booking (free, any time).';
comment on function public.get_my_bookings() is 'The caller''s own bookings for My Bookings, with the cancel / transfer rule and the free-move deadline (move_by).';
comment on function public.get_my_notifications(integer) is 'The caller''s own notifications, newest first, with the class date and time and the free-move deadline.';
