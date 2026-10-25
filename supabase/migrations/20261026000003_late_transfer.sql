-- =============================================================================
-- Migration 19: Version 1.4 decision, clients move their own LATE payments.
--
-- A "late payment" is a booking in 'paid_needs_action': the client paid, but
-- after their seat hold ended and the class had filled up (or was closed,
-- cancelled or had started). Version 1.4 removed the admin's transfer, so the
-- CLIENT now moves it themselves, the same way as a booking in a class the
-- cafe cancelled:
--   - free (no new payment), to any open class with a free seat before its
--     online cutoff
--   - at any time: no 24-hour rule, and it doesn't matter if the old class
--     already happened
--   - only their OWN booking (someone else's gives "couldn't find")
--   - only if the money that came in covers the booking total
-- The new booking is 'confirmed' and points back to the old one
-- (transferred_from), so the payment stays linked and it can't be moved again.
--
-- What this file does:
--   1. booking_paid_enough(booking_id), a PRIVATE helper: true if the paid
--      payments of the booking (and the bookings it came from) add up to at
--      least its total.
--   2. transfer_my_booking(): also accepts 'paid_needs_action' bookings (rule
--      word 'late_payment'). Everything else is unchanged from migration 8.
--   3. get_my_bookings(): change_rule is 'late_payment' for a late payment,
--      can_transfer is true for it (when paid enough), and it stays under
--      "Upcoming" until it is moved or the cafe sorts it out.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: My Bookings (src/components/account/BookingCard.tsx) and the
-- transfer page (src/app/(client)/account/bookings/[bookingId]/transfer/).
-- Tests: supabase/tests/21-late-transfer.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. booking_paid_enough(booking_id)   PRIVATE
-- =============================================================================

-- Checks if the money received covers a booking.
-- Takes: the booking id.
-- Gives back: true if the 'paid' payments on this booking and on the bookings
-- it was transferred from add up to at least the booking's total.
create or replace function public.booking_paid_enough(p_booking_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select sum(p.amount)
    from public.payments p
    where p.booking_id in (select public.booking_family(p_booking_id))
      and p.status = 'paid'
  ), 0) >= (select b.total from public.bookings b where b.id = p_booking_id);
$$;


-- =============================================================================
-- 2. transfer_my_booking(booking_id, new_session_id), late payments too
-- =============================================================================

-- Moves one of the caller's confirmed (or late-paid) bookings to another class.
-- Confirmed bookings: same rules as migration 8 (more than 24h before the old
-- class and only once, unless the cafe cancelled the class).
-- Late payments ('paid_needs_action', NEW): a free move at any time, if the
-- money received covers the total.
-- The new class must be open, before its cutoff, have a free seat, and the
-- client must not already be in it. Both classes are LOCKED, so two people
-- can never get the last seat.
-- The old booking becomes 'transferred'. A new 'confirmed' booking is made with
-- the same inclusions and amounts and points back to the old one. No new payment.
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
  elsif v_booking.status not in ('confirmed', 'paid_needs_action') then
    raise exception 'Only confirmed bookings can be transferred.';
  end if;

  -- NEW (Version 1.4): a late payment may only be moved if the money that
  -- came in covers the booking total. (Otherwise the cafe sorts it out.)
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
  -- before), 'free_transfer' (the cafe cancelled the class) or, NEW,
  -- 'late_payment' (paid after the hold ended: a free move at any time, like
  -- a cancelled class, so the 24-hour rule doesn't apply).
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
-- 3. get_my_bookings(), with the late-payment rule
-- =============================================================================

-- Same as migration 8 (the logged-in client's own bookings for My Bookings),
-- except for a late payment ('paid_needs_action'):
--   change_rule   'late_payment'
--   can_transfer  true if the money received covers the total
--   is_upcoming   always true, so it stays in view until it is moved
-- Takes: nothing (uses the logged-in user). Gives back: one row per booking.
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
      -- NEW: a late payment is owed a free transfer too, at any time
      or b.status = 'paid_needs_action'
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
    -- can_transfer: the same checks as transfer_my_booking()
    coalesce(
      rule.value in ('transfer', 'free_transfer')
        or (rule.value = 'late_payment' and public.booking_paid_enough(b.id)),
      false
    ),
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
  -- The cancel / transfer rule: for confirmed bookings (change_rule), and
  -- NEW 'late_payment' for a late payment (free move, any time)
  left join lateral (
    select case
             when b.status = 'paid_needs_action' then 'late_payment'
             else public.change_rule(s.date, s.start_time, s.status, b.transferred_from)
           end as value
    where b.status in ('confirmed', 'paid_needs_action')
  ) rule on true
  where b.user_id = auth.uid()  -- SECURITY: only the caller's own bookings
    and b.status <> 'expired'
    and not (b.status = 'pending_payment' and b.hold_expires_at <= now())
  order by s.date, s.start_time, b.created_at;
$$;


-- =============================================================================
-- Who may call what
-- =============================================================================

-- The helper is private: only our own functions use it. (create or replace
-- keeps the rights the other two functions already have.)
revoke all on function public.booking_paid_enough(uuid)
from public, anon, authenticated, service_role;

comment on function public.booking_paid_enough(uuid) is 'Private: true if the paid payments of a booking (and the ones it came from) cover its total.';
comment on function public.transfer_my_booking(uuid, uuid) is 'Client moves a confirmed booking (over 24h before, once; free if the cafe cancelled) or a late-paid booking (free, any time) to another class.';
