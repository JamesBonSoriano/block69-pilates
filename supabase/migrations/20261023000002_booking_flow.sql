-- =============================================================================
-- Migration 6: read-only helpers for the booking pages (Phase C, Step 9).
--
-- What this file does:
--   Adds two functions the booking pages call with supabase.rpc(...). Neither
--   one changes anything: they only READ, and only the caller's OWN bookings.
--     get_my_booking(booking_id)
--         The pay page (/book/pay/...) and the "You're booked" page
--         (/book/done/...) show one booking: the class, the price breakdown,
--         the voucher code, the payment, and how many seconds of the seat
--         hold are left (worked out with the DATABASE clock, the same clock
--         book_seat() and seats_left() use).
--     get_my_session_booking(session_id)
--         "Do I already hold a seat in this class?" Booking step 2 uses it to
--         send someone with an unpaid hold straight to their pay page instead
--         of showing an error.
--   Plus one private helper, booking_family(), used by get_my_booking.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website calls the functions from src/lib/data/booking.ts and
-- src/lib/booking/actions.ts.
--
-- Why get_my_booking needs "security definer" (owner's rights):
--   Clients may read their own bookings and payments (migration 2), but NOT
--   promo vouchers (codes like WELCOME10 have no owner, so nobody can list
--   them). The pay page still wants to show "WELCOME10 (10% off)". This
--   function shows the code ONLY on the caller's own booking, i.e. a code
--   they typed in themselves. It never shows anyone else's booking or code.
--
-- Voucher preview: booking step 2 previews a code with check_voucher() from
-- migration 3. It already reserves nothing, and it gives the SAME "isn't
-- valid" message for another client's personal code as for a made-up code,
-- so it can't be used to find other people's codes. So no new function is
-- needed for that (tests in supabase/tests/09-booking-flow.test.mjs).
--
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- booking_family(booking_id)   PRIVATE helper
-- -----------------------------------------------------------------------------

-- Finds a booking and every booking it was transferred FROM (its "family").
-- Why: when a client transfers, the new booking has no payment of its own;
-- the payment stays on the ORIGINAL booking (transferred_from points back to
-- it). Usually that's one step back, but a free transfer (the cafe cancelled
-- the class) can happen more than once, so we follow the whole chain.
-- Takes: a booking id.
-- Gives back: that booking's id, plus the id of each earlier booking in the chain.
create or replace function public.booking_family(p_booking_id uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  -- "with recursive" = start with one row, then keep adding the row it points to.
  with recursive chain (id, from_id, depth) as (
    -- Start: the booking itself
    select b.id, b.transferred_from, 1
    from public.bookings b
    where b.id = p_booking_id
    union all
    -- Then: the booking it came from, and the one before that, ...
    -- (depth < 20 is only a safety stop; a real chain is 1 to 3 long)
    select b.id, b.transferred_from, c.depth + 1
    from chain c
    join public.bookings b on b.id = c.from_id
    where c.depth < 20
  )
  select chain.id from chain;
$$;


-- -----------------------------------------------------------------------------
-- get_my_booking(booking_id)
-- -----------------------------------------------------------------------------

-- Gives the logged-in client everything the pay page and the "You're booked"
-- page show about ONE of their own bookings.
-- Takes: the booking id (from the page address).
-- Gives back: one row, or NO rows if the booking doesn't exist or isn't the
-- caller's own. (Admins get no rows for other people's bookings either: these
-- pages are only for the person who booked. Admin pages read bookings directly.)
-- Columns:
--   status, the class (date, times, class status), the extras (mat, drink,
--   first time), the money (class_fee, mat_fee, discount, total; the same
--   numbers book_seat() saved, never recalculated),
--   voucher_code / voucher_percent_off / voucher_amount_off (empty if no voucher),
--   hold_expires_at and hold_seconds_left (0 when the hold has ended or the
--     booking isn't waiting for payment),
--   paid_amount / paid_method / paid_at: the latest PAID payment for this
--     booking or the booking it was transferred from (empty if none yet),
--   created_at.
create or replace function public.get_my_booking(p_booking_id uuid)
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
    b.class_fee,
    b.mat_fee,
    b.discount,
    b.total,
    v.code,
    v.percent_off,
    v.amount_off,
    b.hold_expires_at,
    -- Seconds left on the seat hold, rounded UP (so "0" only shows when it has
    -- really ended). Only a 'pending_payment' booking has a live hold.
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
  -- The voucher (if any). Shown only because this is the caller's own booking.
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
    -- SECURITY: only the caller's own booking. A guest has no auth.uid(), so
    -- this is never true for them (they can't even call it, see the grants).
    and b.user_id = auth.uid();
$$;


-- -----------------------------------------------------------------------------
-- get_my_session_booking(session_id)
-- -----------------------------------------------------------------------------

-- Checks if the logged-in client already holds a seat in one class.
-- "Holds a seat" means exactly what book_seat() counts (migration 3,
-- my_seat_status): confirmed, awaiting_verification, attended, or
-- pending_payment with the hold still running.
-- Takes: the class session id.
-- Gives back: one row (booking_id, status) for that booking, or NO rows.
-- It runs with the CALLER's rights (no security definer), so Row Level
-- Security already limits it to their own bookings.
create or replace function public.get_my_session_booking(p_session_id uuid)
returns table (
  booking_id uuid,
  status     public.booking_status
)
language sql
stable
set search_path = ''
as $$
  select b.id, b.status
  from public.bookings b
  where b.session_id = p_session_id
    and b.user_id = auth.uid()
    and (
      b.status in ('confirmed', 'awaiting_verification', 'attended')
      or (b.status = 'pending_payment' and b.hold_expires_at > now())
    )
  -- There can only be one (book_seat refuses a second), but just in case,
  -- take the newest.
  order by b.created_at desc
  limit 1;
$$;


-- -----------------------------------------------------------------------------
-- Who may call what (same pattern as migration 3)
-- -----------------------------------------------------------------------------

-- Take every right away first (Supabase gives all roles every new function).
revoke all on function
  public.booking_family(uuid),
  public.get_my_booking(uuid),
  public.get_my_session_booking(uuid)
from public, anon, authenticated, service_role;

-- The private helper stays locked. The two page functions: logged-in users only.
grant execute on function
  public.get_my_booking(uuid),
  public.get_my_session_booking(uuid)
to authenticated;


-- Short descriptions that show up in the Supabase dashboard.
comment on function public.booking_family(uuid) is 'Private: a booking plus every booking it was transferred from.';
comment on function public.get_my_booking(uuid) is 'One of the caller''s own bookings with class, money, voucher code, payment and hold seconds left (pay and booked pages).';
comment on function public.get_my_session_booking(uuid) is 'The caller''s seat-holding booking in one class, if any (booking step 2).';
