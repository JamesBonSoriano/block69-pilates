-- =============================================================================
-- Migration 18: Revisions "Version 1.4" (admin side, part 1).
--
-- What this file does:
--   1. booking_has_paid_payment(booking_id), a PRIVATE helper: true if the
--      booking (or a booking it was transferred from) has a PAID payment.
--      After a transfer the payment stays on the ORIGINAL booking, so it
--      looks at the whole family (booking_family(), migration 6).
--   2. admin_set_attendance() now REFUSES:
--        - a booking with no paid payment ("Full payment is required to
--          confirm your booking", so an unpaid guest can't be marked attended)
--        - a booking in a class the cafe cancelled (the client moves to
--          another class instead)
--      The other rules stay: confirmed / attended / no-show only, and only on
--      or after the class day.
--   3. admin_get_booking(): can_mark_attendance uses the same checks, so the
--      booking details page only shows the Attendance card when marking would
--      work.
--
-- Nothing else changes. The Walk-in booking and Attendance PAGES were removed
-- from the website, but their database functions (admin_walkin_booking,
-- admin_class_rosters, ...) stay. admin_transfer_booking stays too, though
-- the admin page no longer offers it (clients transfer themselves).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: src/app/admin/(panel)/bookings/[bookingId]/page.tsx and
-- src/lib/admin/actions.ts (Attended / No-show).
-- Tests: supabase/tests/20-v14-admin.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. booking_has_paid_payment(booking_id)   PRIVATE
-- =============================================================================

-- Checks if a booking has been paid for.
-- Takes: the booking id.
-- Gives back: true if a payment with status 'paid' sits on this booking or on
-- any booking it was transferred from (PayMongo, an approved GCash / BPI
-- screenshot, or a walk-in's cash). Pending, failed, expired, rejected and
-- refunded payments don't count.
create or replace function public.booking_has_paid_payment(p_booking_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.payments p
    where p.booking_id in (select public.booking_family(p_booking_id))
      and p.status = 'paid'
  );
$$;


-- =============================================================================
-- 2. admin_set_attendance(booking_id, status), with the payment check
-- =============================================================================

-- Admin marks a guest as attended or no-show (booking details page).
-- Only PAID confirmed bookings can be marked (Version 1.4), never in a class
-- the cafe cancelled, and only on or after the class day. A mistake can be
-- fixed by marking an attended / no-show booking again.
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
  v_session  public.class_sessions%rowtype;
begin
  if p_status is null or p_status not in ('attended', 'no_show') then
    raise exception 'Attendance can only be set to attended or no-show.';
  end if;

  -- Lock the booking so two admins can't change it at the same moment
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

  select s.* into v_session from public.class_sessions s where s.id = v_booking.session_id;
  if v_session.status = 'cancelled' then
    raise exception 'The cafe cancelled this class, so attendance can''t be marked. The client can move to another class from My Bookings.';
  end if;
  if v_session.date > public.manila_today() then
    raise exception 'You can only mark attendance on or after the class day.';
  end if;

  -- NEW: full payment is required (Version 1.4)
  if not public.booking_has_paid_payment(v_booking.id) then
    raise exception 'This booking has no paid payment yet, so attendance can''t be marked.';
  end if;

  update public.bookings b set status = p_status where b.id = v_booking.id;
  return p_status;
end;
$$;


-- =============================================================================
-- 3. admin_get_booking(booking_id), with the new can_mark_attendance
-- =============================================================================

-- Same as migration 9 (everything about ONE booking, for the admin's booking
-- details page). Only can_mark_attendance changed: it's now true only when
-- admin_set_attendance() above would allow it (paid, class not cancelled,
-- on or after the class day).
create or replace function public.admin_get_booking(p_booking_id uuid)
returns table (
  booking_id            uuid,
  status                public.booking_status,
  shown_status          public.booking_status,
  created_at            timestamptz,
  updated_at            timestamptz,
  hold_expires_at       timestamptz,
  agreed_at             timestamptz,
  not_pregnant_confirmed boolean,
  first_time            boolean,
  health_notes          text,
  drink_choice          text,
  mat_rental            boolean,
  class_fee             numeric,
  mat_fee               numeric,
  discount              numeric,
  total                 numeric,
  voucher_code          text,
  voucher_source        public.voucher_source,
  session_id            uuid,
  class_date            date,
  start_time            time,
  end_time              time,
  session_status        public.session_status,
  capacity              integer,
  seats_left            integer,
  user_id               uuid,
  guest_name            text,
  guest_email           text,
  guest_contact         text,
  guest_instagram       text,
  is_walkin             boolean,
  account_active        boolean,
  moved_from_booking_id uuid,
  moved_from_date       date,
  moved_from_start_time time,
  moved_to_booking_id   uuid,
  moved_to_date         date,
  moved_to_start_time   time,
  can_mark_attendance   boolean,
  payments              jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_admin();

  return query
  select
    b.id,
    b.status,
    case
      when b.status = 'pending_payment' and b.hold_expires_at <= now() then 'expired'::public.booking_status
      else b.status
    end,
    b.created_at,
    b.updated_at,
    b.hold_expires_at,
    b.agreed_at,
    b.not_pregnant_confirmed,
    b.first_time,
    b.health_notes,
    b.drink_choice,
    b.mat_rental,
    b.class_fee,
    b.mat_fee,
    b.discount,
    b.total,
    v.code,
    v.source,
    s.id,
    s.date,
    s.start_time,
    s.end_time,
    s.status,
    s.capacity,
    greatest(0, s.capacity - public.seats_taken(s.id)),
    b.user_id,
    coalesce(b.walkin_name, nullif(btrim(p.full_name), ''), p.email, 'Guest'),
    p.email,
    coalesce(b.walkin_contact, p.mobile),
    p.instagram,
    b.user_id is null,
    p.is_active,
    from_b.id,
    from_s.date,
    from_s.start_time,
    to_b.id,
    to_s.date,
    to_s.start_time,
    -- Same checks as admin_set_attendance() (this migration): the right
    -- status, a class the cafe didn't cancel, on or after the class day,
    -- and a PAID payment in the booking's family
    (b.status in ('confirmed', 'attended', 'no_show')
       and s.status <> 'cancelled'
       and s.date <= public.manila_today()
       and public.booking_has_paid_payment(b.id)),
    -- Every payment in the booking's family, newest first, as a JSON list
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'booking_id', x.booking_id,
          'provider', x.provider,
          'method', x.method,
          'amount', x.amount,
          'status', x.status,
          'paymongo_ref', x.paymongo_ref,
          'has_screenshot', x.screenshot_path is not null,
          'verified_by_name', coalesce(nullif(btrim(vp.full_name), ''), vp.email),
          'paid_at', x.paid_at,
          'created_at', x.created_at
        )
        order by coalesce(x.paid_at, x.created_at) desc
      )
      from public.payments x
      left join public.profiles vp on vp.id = x.verified_by
      where x.booking_id in (select public.booking_family(b.id))
    ), '[]'::jsonb)
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  left join public.profiles p on p.id = b.user_id
  left join public.vouchers v on v.id = b.voucher_id
  -- The class it was moved FROM (one step back)
  left join public.bookings from_b on from_b.id = b.transferred_from
  left join public.class_sessions from_s on from_s.id = from_b.session_id
  -- The class it was moved TO (one step forward)
  left join public.bookings to_b on to_b.transferred_from = b.id
  left join public.class_sessions to_s on to_s.id = to_b.session_id
  where b.id = p_booking_id;
end;
$$;


-- =============================================================================
-- Who may call what
-- =============================================================================

-- The helper is private: only our own functions use it. (create or replace
-- keeps the rights the other two functions already have.)
revoke all on function public.booking_has_paid_payment(uuid)
from public, anon, authenticated, service_role;

-- Short descriptions that show up in the Supabase dashboard.
comment on function public.booking_has_paid_payment(uuid) is 'Private: true if the booking (or one it was transferred from) has a paid payment.';
comment on function public.admin_set_attendance(uuid, public.booking_status) is 'Admin: mark a PAID booking attended or no_show (not in a cancelled class, from the class day).';
