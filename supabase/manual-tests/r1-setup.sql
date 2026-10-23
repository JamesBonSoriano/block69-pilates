-- =============================================================================
-- Revisions part 1 manual test: SETUP helpers.
--
-- Where it's used: paste ONE part at a time into the Supabase SQL Editor by
-- hand. It is NOT a migration and is never run by `npx supabase db push`.
-- Undo the bookings with r1-cleanup.sql.
--
-- Use a TEST CLIENT account (not your admin account): the cleanup removes
-- every booking, payment and notification of that account.
-- Change the email in each part to your test client's email.
-- (The SQL Editor runs as the database owner, so the "birthday can only be
-- set once" rule from migration 12 doesn't stop these changes. That rule only
-- applies to the website.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1: make the test client "an old account with no birthday"
-- Then log in as them and open My Account or Book a Class: you should be sent
-- to "One more thing" (/account/birthday) once, and back afterwards.
-- -----------------------------------------------------------------------------
update public.profiles
set birthday = null
where lower(email) = lower('your-test-client@example.com')  -- CHANGE THIS
  and role = 'client';


-- -----------------------------------------------------------------------------
-- PART 2: sample updates for the Notifications page (and the unread dot)
-- Makes two bookings for the test client in the next open classes that have
-- a free seat (marked "R1 TEST" in the health notes):
--   1. a CONFIRMED booking        -> "Booking confirmed"
--   2. a GCash transfer to check  -> "We're checking your payment"
--      (then approve or reject it on /admin/payments as the admin, to see
--      "Payment approved" / "Payment not approved")
-- The notifications are made by the database's own triggers, exactly like
-- on the real website.
-- -----------------------------------------------------------------------------
do $$
declare
  v_email   text := 'your-test-client@example.com';  -- CHANGE THIS
  v_user    uuid;
  v_classes uuid[];
  v_waiting uuid;
begin
  select id into v_user from public.profiles where lower(email) = lower(v_email) and role = 'client';
  if v_user is null then
    raise exception 'No client account with the email %.', v_email;
  end if;

  -- The next 2 open classes (from tomorrow) with a free seat that the test
  -- client isn't already in
  select array_agg(id) into v_classes from (
    select s.id
    from public.class_sessions s
    where s.status = 'open'
      and s.date > (now() at time zone 'Asia/Manila')::date
      and public.seats_taken(s.id) < s.capacity
      and not exists (
        select 1 from public.bookings b
        where b.session_id = s.id and b.user_id = v_user
          and b.status in ('pending_payment', 'awaiting_verification', 'confirmed', 'paid_needs_action', 'attended')
      )
    order by s.date, s.start_time
    limit 2
  ) x;
  if coalesce(array_length(v_classes, 1), 0) < 2 then
    raise exception 'Not enough open classes with a free seat. Run select public.generate_sessions(4); first.';
  end if;

  -- 1. A confirmed (paid) booking
  insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee,
                               discount, total, health_notes, not_pregnant_confirmed, agreed_at)
  values (v_classes[1], v_user, 'confirmed', false, null, 500, 0, 0, 500, 'R1 TEST', true, now());

  -- 2. A transfer waiting for the cafe to check it (seat held for 1 day)
  insert into public.bookings (session_id, user_id, status, mat_rental, class_fee, mat_fee, discount, total,
                               health_notes, not_pregnant_confirmed, agreed_at, hold_expires_at)
  values (v_classes[2], v_user, 'pending_payment', true, 500, 50, 0, 550,
          'R1 TEST', true, now(), now() + interval '1 day')
  returning id into v_waiting;
  insert into public.payments (booking_id, provider, method, amount, screenshot_path)
  values (v_waiting, 'manual', 'gcash', 550, v_user || '/r1-test-screenshot.png');
  -- pending_payment -> awaiting_verification makes the "checking" update
  update public.bookings set status = 'awaiting_verification' where id = v_waiting;

  raise notice 'Made 2 test bookings (and 2 updates) for %.', v_email;
end;
$$;


-- -----------------------------------------------------------------------------
-- PART 3: see the test client's updates (newest first), like the page does
-- -----------------------------------------------------------------------------
select n.created_at, n.kind, n.voucher_code, n.read_at, s.date, s.start_time
from public.notifications n
join public.profiles p on p.id = n.user_id
left join public.bookings b on b.id = n.booking_id
left join public.class_sessions s on s.id = b.session_id
where lower(p.email) = lower('your-test-client@example.com')  -- CHANGE THIS
order by n.created_at desc;
