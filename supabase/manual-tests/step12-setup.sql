-- =============================================================================
-- Step 12 manual test: SETUP helpers (fake a LATE payment, check the totals).
--
-- Where it's used: paste ONE part at a time into the Supabase SQL Editor by
-- hand. It is NOT a migration and is never run by `npx supabase db push`.
-- Undo everything with step12-cleanup.sql.
--
-- Use a TEST CLIENT account for the click-through (not your admin account),
-- because the cleanup removes every booking and payment of that account.
-- Change the email below (in each part) to your test client's email.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1: fake a LATE payment (the seat hold ended before PayMongo was paid)
--
-- How to use:
--   1. As the test client, book a class and click "Pay ... with GCash", so
--      PayMongo's page opens. DON'T pay yet. Leave that tab open.
--   2. Set v_mode below:
--        'free' = only end the hold. After paying, the booking should be
--                 CONFIRMED (a seat was still free).
--        'full' = end the hold AND fill every other seat with "TEST late
--                 filler" walk-ins. After paying, the booking should be
--                 "PAID, NEEDS ACTION" (the class is full).
--   3. Run this part, then pay on PayMongo's page (GCash > Authorize).
--   4. PayMongo sends you back to /book/pay/<id>/return, which applies the
--      late payment rule.
-- -----------------------------------------------------------------------------
do $$
declare
  v_email   text := 'your-test-client@example.com';  -- CHANGE THIS
  v_mode    text := 'full';                           -- 'free' or 'full'
  v_booking public.bookings%rowtype;
  v_free    integer;
begin
  -- The test client's newest unpaid booking that has a PayMongo page open
  select b.* into v_booking
  from public.bookings b
  join public.profiles p on p.id = b.user_id
  where lower(p.email) = lower(v_email)
    and b.status = 'pending_payment'
    and exists (
      select 1 from public.payments x
      where x.booking_id = b.id and x.provider = 'paymongo' and x.status = 'pending'
    )
  order by b.created_at desc
  limit 1;

  if not found then
    raise exception 'No unpaid booking with an open PayMongo page for %. Click Pay first (step 1).', v_email;
  end if;

  -- End the seat hold one minute ago (as if 15 minutes passed)
  update public.bookings set hold_expires_at = now() - interval '1 minute' where id = v_booking.id;

  if v_mode = 'full' then
    -- Fill every free seat with a walk-in, so the class is full
    v_free := (select capacity from public.class_sessions where id = v_booking.session_id)
              - public.seats_taken(v_booking.session_id);
    for n in 1 .. greatest(v_free, 0) loop
      insert into public.bookings (session_id, walkin_name, walkin_contact, status, mat_rental,
                                   class_fee, mat_fee, discount, total, not_pregnant_confirmed, agreed_at)
      values (v_booking.session_id, 'TEST late filler ' || n, '09170000000', 'confirmed', false,
              0, 0, 0, 0, true, now());
    end loop;
  end if;

  raise notice 'Booking B69-% : hold ended%. Now pay on PayMongo''s page.',
    upper(left(replace(v_booking.id::text, '-', ''), 8)),
    case when v_mode = 'full' then format(', and %s filler seat(s) added', greatest(v_free, 0)) else '' end;
end;
$$;


-- -----------------------------------------------------------------------------
-- PART 2: what the Billings cards SHOULD show (compare with /admin/payments)
-- Paid money only, Philippine time, week starts Monday.
-- -----------------------------------------------------------------------------
select
  coalesce(sum(p.amount) filter (where p.paid_at >= public.at_manila(public.manila_today(), '00:00')), 0) as paid_today,
  coalesce(sum(p.amount) filter (where p.paid_at >= public.at_manila(date_trunc('week', public.manila_today())::date, '00:00')), 0) as paid_this_week,
  coalesce(sum(p.amount) filter (where p.paid_at >= public.at_manila(date_trunc('month', public.manila_today())::date, '00:00')), 0) as paid_this_month,
  coalesce(sum(least(b.mat_fee, p.amount)) filter (where p.paid_at >= public.at_manila(date_trunc('month', public.manila_today())::date, '00:00')), 0) as mats_this_month,
  coalesce(sum(least(b.mat_fee, p.amount)), 0) as mats_all_time
from public.payments p
join public.bookings b on b.id = p.booking_id
where p.status = 'paid';


-- -----------------------------------------------------------------------------
-- PART 3 (optional): see the test client's bookings and payments
-- -----------------------------------------------------------------------------
select
  'B69-' || upper(left(replace(b.id::text, '-', ''), 8)) as booking,
  b.status as booking_status, b.total, b.hold_expires_at,
  p.provider, p.method, p.amount, p.status as payment_status, p.paymongo_ref, p.screenshot_path
from public.bookings b
join public.profiles pr on pr.id = b.user_id
left join public.payments p on p.booking_id = b.id
where lower(pr.email) = lower('your-test-client@example.com')  -- CHANGE THIS
order by b.created_at desc, p.created_at desc;
