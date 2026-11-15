-- =============================================================================
-- Migration 24: Version 1.6, admin side (Appointments).
--
-- What this file does:
--   1. booking_admin_actions (the admin-only log of what an admin did to a
--      booking) accepts two new actions:
--        'reschedule'      the admin moved the booking to another class
--                          (admin_reschedule_booking below)
--        'reject_payment'  the admin rejected a GCash / BPI screenshot, with
--                          a reason (admin_reject_payment below)
--   2. admin_reschedule_booking(booking_id, new_session_id, reason): the
--      admin moves ONE booking to another open class, for free, with a
--      required reason. Version 1.4 took the admin transfer off the website
--      (clients move themselves); that block is lifted ONLY for this
--      function. The old admin_transfer_booking stays unused.
--      Allowed for:
--        - 'confirmed' bookings, and
--        - late payments ('paid_needs_action') in a class the CAFE cancelled,
--          if the money received covers the total
--      The new class must be: open, a different class, not started, before
--      the online cutoff (8:00 AM on class day, setting cutoff_time), with a
--      free seat, and the client must not already be in it. Both classes are
--      LOCKED, so two people can never get the last seat.
--      The old booking becomes 'transferred'; a new 'confirmed' booking is
--      made with the same inclusions and amounts (transferred_from points to
--      the old one, so the payment stays linked). No new payment.
--      The client gets the usual "Booking moved" update in their bell (the
--      notify_booking_change trigger, migration 12) and the website emails
--      them.
--   3. admin_reject_payment(payment_id, reason): the same as rejecting in
--      admin_review_manual_payment (payment 'rejected', booking 'expired',
--      the seat is freed, the client gets "Payment not approved"), but the
--      reason is REQUIRED and saved in booking_admin_actions.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: /admin/appointments/<id>/manage
-- (src/app/admin/(panel)/appointments/[bookingId]/manage/page.tsx) through
-- src/lib/admin/actions.ts (rescheduleBooking, rejectPayment).
-- Tests: supabase/tests/26-v16-admin.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. booking_admin_actions: two new actions
-- =============================================================================

-- The list of allowed actions is a check constraint, so it is swapped for
-- one with the two new words. Old rows all use the first three, so they pass.
alter table public.booking_admin_actions
  drop constraint booking_admin_actions_action_check;

alter table public.booking_admin_actions
  add constraint booking_admin_actions_action_check
  check (action in ('transfer', 'cancel_voucher', 'cancel_no_credit', 'reschedule', 'reject_payment'));

comment on table public.booking_admin_actions is
  'Admin cancels / transfers / re-schedules / payment rejections of one booking, with the normal rule, override flag and reason. Admins only.';


-- =============================================================================
-- 2. admin_reschedule_booking(booking_id, new_session_id, reason)
-- =============================================================================

-- The admin re-schedules ONE booking to another class (free, reason required).
-- Takes:
--   p_booking_id      the booking to move
--   p_new_session_id  the class to move it to
--   p_reason          why (required, up to 500 characters). Saved in
--                     booking_admin_actions; the website also puts it in the
--                     email to the client.
-- Gives back: the new booking's id.
-- Stops with a plain-English error when a rule says no (see the top of the
-- file). Only active admins may call it (require_admin).
create or replace function public.admin_reschedule_booking(
  p_booking_id     uuid,
  p_new_session_id uuid,
  p_reason         text
)
returns uuid
language plpgsql
volatile
security definer  -- writes bookings and the admin log, which the browser can't
set search_path = ''
as $$
declare
  v_admin_id    uuid := public.require_admin();  -- refuses non-admins first
  v_reason      text := nullif(btrim(p_reason), '');
  v_booking     public.bookings%rowtype;
  v_old         public.class_sessions%rowtype;
  v_new         public.class_sessions%rowtype;
  v_new_booking uuid;
begin
  -- A reason is always needed (it is an admin decision, not a client rule)
  if v_reason is null then
    raise exception 'Please write a reason for the re-schedule. It is saved with the booking.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Please keep the reason to 500 characters or less.';
  end if;

  -- LOCK the booking so it can't be cancelled or moved twice at the same time
  -- (by the client and the admin, or by two admins).
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;

  if p_new_session_id is null or p_new_session_id = v_booking.session_id then
    raise exception 'Please pick a different class.';
  end if;

  -- LOCK both classes, smallest id first (the same order as the other
  -- transfer functions), so two moves going opposite ways can't get stuck
  -- waiting for each other. Nobody can book the new class's last seat while
  -- we check it.
  perform 1
  from public.class_sessions s
  where s.id in (v_booking.session_id, p_new_session_id)
  order by s.id
  for update;

  select s.* into v_old from public.class_sessions s where s.id = v_booking.session_id;
  select s.* into v_new from public.class_sessions s where s.id = p_new_session_id;

  -- Which bookings may be re-scheduled:
  --   confirmed (paid), or a late payment in a class the cafe cancelled
  --   (only if the money received covers the total)
  if v_booking.status = 'paid_needs_action' and v_old.status = 'cancelled' then
    if not public.booking_paid_enough(v_booking.id) then
      raise exception 'The money received doesn''t cover this booking''s total, so it can''t be re-scheduled. Cancel it instead.';
    end if;
  elsif v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed bookings, or bookings in a class the cafe cancelled, can be re-scheduled.';
  end if;

  -- The new class must still take people (never skipped):
  if v_new.id is null then
    raise exception 'Sorry, we couldn''t find the class you picked.';
  end if;
  if v_new.status <> 'open' then
    raise exception 'The class you picked is not open. Pick another class.';
  end if;
  -- Not started and before the online cutoff (8:00 AM on class day, or the
  -- start time if that comes first: booking_closes_at, migration 3)
  if now() >= public.booking_closes_at(v_new.date, v_new.start_time) then
    raise exception 'Booking for the class you picked has closed (it has started, or it is past the cutoff). Pick a later class.';
  end if;
  -- The client can't hold two seats in the same class
  if v_booking.user_id is not null and public.my_seat_status(v_booking.user_id, v_new.id) is not null then
    raise exception 'This client already has a booking in the class you picked.';
  end if;
  -- A free seat (no overbooking, the class is locked above)
  if public.seats_taken(v_new.id) >= v_new.capacity then
    raise exception 'The class you picked is full. Pick another class.';
  end if;

  -- The old booking gives up its seat.
  update public.bookings b set status = 'transferred' where b.id = v_booking.id;

  -- The new booking: same person, inclusions and amounts, already paid, so
  -- 'confirmed'. Payments stay on the old booking (transferred_from links
  -- them). The voucher trigger skips it because transferred_from is set.
  -- The notify_booking_change trigger gives the client "Booking moved".
  insert into public.bookings (
    session_id, user_id, walkin_name, walkin_contact, status, mat_rental, drink_choice, voucher_id,
    class_fee, mat_fee, discount, total,
    first_time, health_notes, not_pregnant_confirmed, agreed_at, transferred_from
  )
  values (
    v_new.id, v_booking.user_id, v_booking.walkin_name, v_booking.walkin_contact, 'confirmed',
    v_booking.mat_rental, v_booking.drink_choice, v_booking.voucher_id,
    v_booking.class_fee, v_booking.mat_fee, v_booking.discount, v_booking.total,
    v_booking.first_time, v_booking.health_notes, v_booking.not_pregnant_confirmed, v_booking.agreed_at,
    v_booking.id
  )
  returning id into v_new_booking;

  -- Save who did it, what the client rules said at that moment, and why.
  -- Not an "override": re-scheduling is the admin's own action now.
  insert into public.booking_admin_actions (booking_id, new_booking_id, action, normal_rule, overridden, note, admin_id)
  values (
    v_booking.id, v_new_booking, 'reschedule',
    public.admin_change_rule(v_booking.status, v_old.date, v_old.start_time, v_old.status, v_booking.transferred_from),
    false, v_reason, v_admin_id
  );

  return v_new_booking;
end;
$$;


-- =============================================================================
-- 3. admin_reject_payment(payment_id, reason)
-- =============================================================================

-- The admin rejects a GCash / BPI transfer screenshot, with a reason.
-- Takes: the payment id and the reason (required, up to 500 characters).
-- Gives back: the booking's new status ('expired': the seat is free again).
-- The checks (manual payment, still pending, booking awaiting verification)
-- and the change itself are done by admin_review_manual_payment (migration 3),
-- in the same transaction, so a refused reject saves nothing.
create or replace function public.admin_reject_payment(
  p_payment_id uuid,
  p_reason     text
)
returns public.booking_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := public.require_admin();  -- refuses non-admins first
  v_reason   text := nullif(btrim(p_reason), '');
  v_booking  uuid;
  v_status   public.booking_status;
begin
  if v_reason is null then
    raise exception 'Please write why the payment is rejected. It is saved with the booking.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Please keep the reason to 500 characters or less.';
  end if;

  -- Which booking the payment belongs to (for the log below)
  select p.booking_id into v_booking from public.payments p where p.id = p_payment_id;
  if not found then
    raise exception 'Sorry, we couldn''t find that payment.';
  end if;

  -- Reject it: payment 'rejected', booking 'expired' (locks and checks inside)
  v_status := public.admin_review_manual_payment(p_payment_id, false);

  -- Save who did it and why (admins only can read this table)
  insert into public.booking_admin_actions (booking_id, action, normal_rule, overridden, note, admin_id)
  values (v_booking, 'reject_payment', 'payment_check', false, v_reason, v_admin_id);

  return v_status;
end;
$$;


-- =============================================================================
-- Who may call what (same pattern as the earlier migrations)
-- =============================================================================

-- Take every right away first (Supabase gives all roles every new function).
revoke all on function
  public.admin_reschedule_booking(uuid, uuid, text),
  public.admin_reject_payment(uuid, text)
from public, anon, authenticated, service_role;

-- Logged-in users may call them; each checks is_admin() inside, so a client
-- gets "admins only".
grant execute on function
  public.admin_reschedule_booking(uuid, uuid, text),
  public.admin_reject_payment(uuid, text)
to authenticated;

comment on function public.admin_reschedule_booking(uuid, uuid, text) is
  'Admin: move one confirmed booking (or a late payment in a cafe-cancelled class) to another open class before its cutoff, free, with a required reason.';
comment on function public.admin_reject_payment(uuid, text) is
  'Admin: reject a manual GCash / BPI transfer with a required reason (saved in booking_admin_actions).';
