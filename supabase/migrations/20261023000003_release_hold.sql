-- =============================================================================
-- Migration 7: "Change details" on the pay page (Phase C, Step 9).
--
-- What this file does:
--   1. Adds release_my_hold(booking_id): a client gives up their OWN unpaid
--      seat hold straight away, so they can go back to booking step 2 and
--      change their drink, mat, notes or voucher. The booking becomes
--      'expired', which frees the seat and the voucher at once (an expired
--      booking doesn't count as a taken seat, and doesn't reserve a voucher).
--   2. Adds health_notes to get_my_booking() (migration 6), so step 2 can
--      fill the person's notes back in after "Change details".
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The pay page's "Change details" button calls releaseHold() in
-- src/lib/booking/actions.ts, which calls release_my_hold().
--
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- release_my_hold(booking_id)
-- -----------------------------------------------------------------------------

-- Gives up one of the caller's own unpaid seat holds right away.
-- Rules:
--   - only the person who made the booking (not other clients, not admins
--     from the client pages, never guests)
--   - only while it is 'pending_payment' (a paid, cancelled or already
--     released booking can't be "released")
--   - the account must be active (same as booking)
-- It changes the status to 'expired' and nothing else, so the old booking
-- keeps a record of what was picked (step 2 reads it to fill the form back in).
-- No money is involved: nothing was paid yet, and the voucher trigger
-- (migration 3) only spends a use when a booking becomes paid.
-- Takes: the booking id.
-- Gives back: the class session id (so the page can go back to step 2 for
-- the same class). Stops with a plain-English error otherwise.
create or replace function public.release_my_hold(p_booking_id uuid)
returns uuid
language plpgsql
volatile
security definer  -- clients can't update bookings directly (migration 2)
set search_path = ''
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_booking public.bookings%rowtype;
begin
  -- Lock the booking, so it can't be released and paid at the same moment
  -- (the PayMongo webhook in Step 12 will wait here, then see 'expired').
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  -- Not found, or not the caller's booking (same message, so nobody can poke
  -- around other people's bookings).
  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;

  if v_booking.status <> 'pending_payment' then
    raise exception 'This booking is no longer waiting for payment, so it can''t be changed here.';
  end if;

  -- Give the seat (and any voucher use it reserved) back straight away.
  update public.bookings b set status = 'expired' where b.id = v_booking.id;

  return v_booking.session_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- get_my_booking(booking_id), now with health_notes
-- -----------------------------------------------------------------------------
-- Postgres can't add a column to what a function gives back with "create or
-- replace", so we drop it and make it again. Everything else is exactly as in
-- migration 6 (see the comments there); only health_notes is new.
drop function public.get_my_booking(uuid);

-- Gives the logged-in client everything the pay page, the "You're booked"
-- page and booking step 2 ("Change details") show about ONE of their own bookings.
-- Takes: the booking id.
-- Gives back: one row, or NO rows if it doesn't exist or isn't the caller's own.
-- New column: health_notes (their own injuries / medical notes, so step 2
-- can fill them back in).
create function public.get_my_booking(p_booking_id uuid)
returns table (
  booking_id          uuid,
  status              public.booking_status,
  session_id          uuid,
  class_date          date,
  start_time          time,
  end_time            time,
  session_status      public.session_status,
  mat_rental          boolean,
  drink_choice        text,
  first_time          boolean,
  health_notes        text,
  class_fee           numeric,
  mat_fee             numeric,
  discount            numeric,
  total               numeric,
  voucher_code        text,
  voucher_percent_off numeric,
  voucher_amount_off  numeric,
  hold_expires_at     timestamptz,
  hold_seconds_left   integer,
  paid_amount         numeric,
  paid_method         public.payment_method,
  paid_at             timestamptz,
  created_at          timestamptz
)
language sql
stable
security definer
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
    b.first_time,
    b.health_notes,
    b.class_fee,
    b.mat_fee,
    b.discount,
    b.total,
    v.code,
    v.percent_off,
    v.amount_off,
    b.hold_expires_at,
    -- Seconds left on the seat hold, rounded up (0 = ended, or not waiting for payment)
    case
      when b.status = 'pending_payment' and b.hold_expires_at > now()
        then ceil(extract(epoch from b.hold_expires_at - now()))::integer
      else 0
    end,
    pay.amount,
    pay.method,
    pay.paid_at,
    b.created_at
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  left join public.vouchers v on v.id = b.voucher_id
  -- The latest paid payment for this booking or the one it was transferred from.
  left join lateral (
    select p.amount, p.method, p.paid_at
    from public.payments p
    where p.booking_id in (select public.booking_family(b.id))
      and p.status = 'paid'
    order by p.paid_at desc
    limit 1
  ) pay on true
  where b.id = p_booking_id
    -- SECURITY: only the caller's own booking.
    and b.user_id = auth.uid();
$$;


-- -----------------------------------------------------------------------------
-- Who may call what (same pattern as migrations 3 and 6)
-- -----------------------------------------------------------------------------
revoke all on function
  public.release_my_hold(uuid),
  public.get_my_booking(uuid)
from public, anon, authenticated, service_role;

-- Logged-in users only (each function checks the owner itself).
grant execute on function
  public.release_my_hold(uuid),
  public.get_my_booking(uuid)
to authenticated;

comment on function public.release_my_hold(uuid) is 'Client gives up their own pending_payment hold at once (pay page "Change details"); the booking becomes expired.';
comment on function public.get_my_booking(uuid) is 'One of the caller''s own bookings with class, choices, money, voucher code, payment and hold seconds left.';
