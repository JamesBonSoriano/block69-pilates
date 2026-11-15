-- =============================================================================
-- Migration 23: Version 1.6, client side.
--
-- What this file does:
--   1. AGE 18+ (PDF item 5): a trigger on profiles refuses a birthday that
--      makes the person younger than 18 (Philippine date), or one in the
--      future, with "You must be at least 18 years old to book a class."
--      It only runs when a profile is ADDED with a birthday, or when the
--      birthday itself CHANGES, so old rows saved before this rule still
--      save fine when other details (name, mobile...) are edited.
--   2. CLASS CANCELLED BY THE CAFE (PDF item 6): the trigger that runs when
--      a class becomes 'cancelled' now:
--        - releases every unpaid seat hold (pending_payment) in it at once:
--          the booking becomes 'expired', so the seat is free and the client
--          never sees "Waiting for payment / Pay now" for it again. Clients
--          whose hold was still running get the new update
--          'class_cancelled_hold_released' ("you were not charged").
--        - leaves 'awaiting_verification' bookings as they are (money may
--          have been sent). They get the new update 'class_cancelled_checking'
--          and stay in the admin's "Needs action" list. Once the admin
--          approves the payment, the booking is 'confirmed' and the usual
--          free move applies.
--        - paid bookings (confirmed, paid late) keep the free move and the
--          'class_cancelled' update, as before.
--      Unpaid holds already sitting in cancelled classes are released too
--      (one-off clean-up below, no updates sent for those).
--   3. PAYMENT REJECTED (PDF item 7): get_my_bookings() also gives back a
--      booking whose GCash / BPI screenshot was rejected (payment_rejected =
--      true), so My Bookings can say "Payment rejected" and offer "Book
--      again". get_my_rejected_session_booking() tells booking step 2 the
--      same thing for one class. Seat counting does NOT change: an
--      'awaiting_verification' booking still holds its seat until the admin
--      decides.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: sign-up, Finish your profile, My Profile, admin Edit user,
-- My Bookings (src/components/account/BookingCard.tsx), booking step 2
-- (src/app/(client)/book/details/page.tsx), the bell (src/lib/notifications.ts)
-- and admin Cancel class.
-- Tests: supabase/tests/25-v16-client.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. Two new kinds of update for the bell
-- =============================================================================
-- (A new enum value can't be USED in the same transaction it is added in.
-- Below it is only named inside plpgsql function bodies, which Postgres
-- reads when the function first runs, so that is fine.)

-- The cafe cancelled the class while the client's unpaid seat hold was still
-- running: the hold was released and nothing was charged.
alter type public.notification_kind add value if not exists 'class_cancelled_hold_released';
-- The cafe cancelled the class while it was still checking the client's
-- GCash / BPI screenshot. Once approved, the client can move for free.
alter type public.notification_kind add value if not exists 'class_cancelled_checking';


-- =============================================================================
-- 2. AGE 18+: check_birthday_age()   TRIGGER on profiles
-- =============================================================================

-- Refuses a birthday that makes someone younger than 18 today (Philippine
-- date), or a birthday in the future.
-- Takes: the new (and, for an update, the old) profiles row.
-- Gives back: the row to save, or stops the save with a plain message.
-- When it checks:
--   - a new profile WITH a birthday (sign-up; Google sign-ups have none)
--   - an update where the birthday itself changes (My Profile, Finish your
--     profile, admin Edit user, the SQL Editor)
-- A row that already had an under-18 birthday before this rule is left
-- alone unless that birthday is changed, so editing the name still works.
-- Rule: born on or before (today minus 18 years). Someone born 29 Feb turns
-- 18 on 1 March in a year with no 29 Feb (the website uses the same rule).
create or replace function public.check_birthday_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No birthday (allowed: Google sign-ups add it on Finish your profile)
  if new.birthday is null then
    return new;
  end if;
  -- An update that keeps the same birthday: nothing to check
  if tg_op = 'UPDATE' and new.birthday is not distinct from old.birthday then
    return new;
  end if;
  -- Younger than 18 today, or born in the future. (Today's Philippine date
  -- is worked out here, not with the private manila_today() helper, because
  -- this trigger runs with the rights of whoever saves the profile.)
  if new.birthday > ((now() at time zone 'Asia/Manila')::date - interval '18 years')::date then
    raise exception 'You must be at least 18 years old to book a class.';
  end if;
  return new;
end;
$$;

-- Runs before a profile is added, or before its birthday is changed.
-- The "zz" in the name makes it run AFTER the older profile triggers
-- (Postgres runs triggers in name order), so their messages (for example
-- "Please enter a real date in the past") still come first for a client.
drop trigger if exists profiles_zz_check_birthday_age on public.profiles;
create trigger profiles_zz_check_birthday_age
  before insert or update of birthday on public.profiles
  for each row execute function public.check_birthday_age();


-- =============================================================================
-- 3. CLASS CANCELLED: notify_class_cancelled() now also releases unpaid holds
-- =============================================================================

-- When the cafe cancels a class (status becomes 'cancelled'):
--   a. unpaid holds that are still running: the client gets
--      'class_cancelled_hold_released'
--   b. EVERY unpaid hold in the class (running or not) becomes 'expired', so
--      the seat is released and no "Pay now" is ever shown for it
--   c. bookings whose payment is still being checked (awaiting_verification)
--      stay as they are; the client gets 'class_cancelled_checking'
--   d. paid bookings (confirmed, paid_needs_action) get 'class_cancelled'
--      (the free move, as before)
-- Takes: the old and new class_sessions row.
-- Gives back: nothing (an "after" trigger).
-- security definer: it writes to notifications and bookings, which clients
-- can't change themselves.
create or replace function public.notify_class_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    -- a. Tell clients whose unpaid hold was still running (before step b
    --    changes their status). Walk-ins have no account to tell.
    insert into public.notifications (user_id, booking_id, kind)
    select b.user_id, b.id, 'class_cancelled_hold_released'::public.notification_kind
    from public.bookings b
    where b.session_id = new.id
      and b.user_id is not null
      and b.status = 'pending_payment'
      and b.hold_expires_at > now();

    -- b. Release every unpaid hold. 'expired' never counts as a seat
    --    (seats_taken), and notify_booking_change() sends nothing for
    --    pending_payment -> expired, so nobody gets a second update.
    --    If PayMongo still sends a payment later, confirm_online_payment()
    --    (migration 11) makes it 'paid_needs_action' because the class isn't
    --    open, and the client can move for free.
    update public.bookings b
    set status = 'expired'
    where b.session_id = new.id
      and b.status = 'pending_payment';

    -- c. + d. Everyone else who holds a seat: the right update for each
    insert into public.notifications (user_id, booking_id, kind)
    select b.user_id, b.id,
           case
             when b.status = 'awaiting_verification' then 'class_cancelled_checking'
             else 'class_cancelled'
           end::public.notification_kind
    from public.bookings b
    where b.session_id = new.id
      and b.user_id is not null
      and b.status in ('confirmed', 'awaiting_verification', 'paid_needs_action');
  end if;
  return null;
end;
$$;

-- (The trigger class_sessions_notify_cancelled from migration 12 already
-- calls this function, so it doesn't need to be made again.)

-- One-off clean-up: unpaid holds left in classes that were cancelled BEFORE
-- this migration (like the PDF screenshot) are released now. No updates are
-- sent for these old ones.
update public.bookings b
set status = 'expired'
from public.class_sessions s
where s.id = b.session_id
  and s.status = 'cancelled'
  and b.status = 'pending_payment';


-- =============================================================================
-- 4. get_my_bookings(), with payment_rejected
-- =============================================================================

-- New column, so drop and make it again (rights given back below).
drop function if exists public.get_my_bookings();

-- Same as migration 21 (the logged-in client's own bookings for My
-- Bookings), plus:
--   payment_rejected  true for an 'expired' booking whose GCash / BPI
--                     screenshot the cafe rejected. These are now listed
--                     (other expired bookings still aren't), unless the
--                     client already made a newer booking for that class.
--                     Upcoming while the class is still ahead and not
--                     cancelled, so "Book again" can be offered.
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
  move_by               date,
  payment_rejected      boolean
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
      -- the window ends.
      (b.status = 'confirmed' and s.status = 'cancelled' and rule.value = 'free_transfer')
      -- A late payment is owed a free move too, at any time
      or b.status = 'paid_needs_action'
      -- NEW: a rejected payment, while the class is still ahead and running,
      -- so the client can book and pay again
      or (rejected.yes and s.status <> 'cancelled' and public.at_manila(s.date, s.end_time) > now())
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
    rule.move_by,
    coalesce(rejected.yes, false)
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
  -- NEW: an expired booking whose manual transfer was rejected, with no
  -- newer booking by the same client for the same class
  left join lateral (
    select true as yes
    where b.status = 'expired'
      and exists (
        select 1 from public.payments p
        where p.booking_id = b.id and p.provider = 'manual' and p.status = 'rejected'
      )
      and not exists (
        select 1 from public.bookings later
        where later.user_id = b.user_id
          and later.session_id = b.session_id
          and later.created_at > b.created_at
      )
  ) rejected on true
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
        -- The cafe cancelled the class and the window is over
        when window_end.day is not null and public.manila_today() > window_end.day then 'move_window_ended'
        else public.change_rule(s.date, s.start_time, s.status, b.transferred_from)
      end as value,
      window_end.day as move_by
    where b.status in ('confirmed', 'paid_needs_action')
  ) rule on true
  where b.user_id = auth.uid()  -- SECURITY: only the caller's own bookings
    -- Expired bookings are hidden, EXCEPT a rejected payment (NEW)
    and (b.status <> 'expired' or rejected.yes)
    and not (b.status = 'pending_payment' and b.hold_expires_at <= now())
  order by s.date, s.start_time, b.created_at;
$$;


-- =============================================================================
-- 5. get_my_rejected_session_booking(session)   for booking step 2
-- =============================================================================

-- Checks if the logged-in client's LATEST booking for one class had its
-- GCash / BPI transfer rejected by the cafe.
-- Takes: the class session id.
-- Gives back: that booking's id, or null (no booking, or the latest one
-- wasn't a rejected payment). Step 2 then says "Payment rejected" above the
-- form, so the client knows why and can book and pay again.
-- security definer + the auth.uid() filter: only ever the caller's own
-- bookings.
create or replace function public.get_my_rejected_session_booking(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select latest.id
  from (
    -- The caller's newest booking for this class
    select b.id, b.status
    from public.bookings b
    where b.session_id = p_session_id
      and b.user_id = auth.uid()  -- SECURITY: only the caller's own bookings
    order by b.created_at desc
    limit 1
  ) latest
  where latest.status = 'expired'
    and exists (
      select 1 from public.payments p
      where p.booking_id = latest.id and p.provider = 'manual' and p.status = 'rejected'
    );
$$;


-- =============================================================================
-- Who may call what
-- =============================================================================

-- Private: the trigger functions.
revoke all on function
  public.check_birthday_age(),
  public.notify_class_cancelled()
from public, anon, authenticated, service_role;

-- The page functions: logged-in users only.
revoke all on function
  public.get_my_bookings(),
  public.get_my_rejected_session_booking(uuid)
from public, anon, authenticated, service_role;
grant execute on function
  public.get_my_bookings(),
  public.get_my_rejected_session_booking(uuid)
to authenticated;


-- Short descriptions that show up in the Supabase dashboard.
comment on function public.check_birthday_age() is 'Trigger: refuses a new or changed birthday under 18 years old (Philippine date) or in the future.';
comment on function public.notify_class_cancelled() is 'Trigger: when the cafe cancels a class, releases unpaid holds (and tells those clients), and tells everyone else holding a seat.';
comment on function public.get_my_bookings() is 'The caller''s own bookings for My Bookings, with the cancel / transfer rule, the free-move deadline (move_by) and rejected payments.';
comment on function public.get_my_rejected_session_booking(uuid) is 'The caller''s latest booking for one class, if its manual transfer was rejected (booking step 2).';
