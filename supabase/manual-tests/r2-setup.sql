-- =============================================================================
-- Change 17 (client revisions round 2) manual test: SETUP helpers.
--
-- Where it's used: paste ONE part at a time into the Supabase SQL Editor by
-- hand. It is NOT a migration and is never run by `npx supabase db push`.
-- Undo everything with r2-cleanup.sql.
--
-- RUN IT ONLY AFTER THE PUSH: it needs migrations 13 to 16 (for example
-- online bookings without the not-pregnant answer, and 9 weeks of classes).
--
-- Use a TEST CLIENT account (not your admin account): the cleanup removes
-- every booking, payment and notification of that account.
-- Change the email in each part to your test client's email.
-- For DELETE ACCOUNT, use a SECOND, throwaway account (see PART 5): a deleted
-- account can't be brought back.
-- (The SQL Editor runs as the database owner, so the website's profile
-- rules don't stop these changes.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1: "Finish your profile" (like a new Google account)
-- Empties the test client's mobile number and birthday. Then log in as them
-- and open Book a Class > a class, or My Account: you should land on
-- "Finish your profile" (/account/finish-profile), asked for both, and go
-- back where you were after saving.
-- -----------------------------------------------------------------------------
update public.profiles
set mobile = null, birthday = null
where lower(email) = lower('your-test-client@example.com')  -- CHANGE THIS
  and role = 'client';


-- -----------------------------------------------------------------------------
-- PART 2: bookings and payments for the bell, Transfer and the Payments filter
-- Makes three bookings for the test client (health notes "R2 TEST"):
--   1. CONFIRMED, at least 3 days away, paid with GCash today
--        -> the bell shows "Booking confirmed" (1 new)
--        -> My Bookings: Transfer works (more than 24 hours away)
--        -> Payments: Paid / GCash / This month
--   2. A BPI transfer the cafe is still checking, in another class
--        -> the bell shows "We're checking your payment"
--        -> Payments: Being checked / BPI transfer
--        -> Delete account: blocked ("the cafe is still checking a payment")
--   3. A class LAST MONTH (attended), paid by card last month
--        -> Payments: Last month / Card (a test class at 6:59 AM is made for
--           it; the cleanup removes it)
-- The notifications are made by the database's own triggers, exactly like
-- on the real website.
-- -----------------------------------------------------------------------------
do $$
declare
  v_email    text := 'your-test-client@example.com';  -- CHANGE THIS
  v_user     uuid;
  v_classes  uuid[];
  v_booking  uuid;
  v_waiting  uuid;
  v_past     uuid;
  v_past_day date := (date_trunc('month', (now() at time zone 'Asia/Manila')) - interval '1 month')::date + 9;
begin
  select id into v_user from public.profiles where lower(email) = lower(v_email) and role = 'client';
  if v_user is null then
    raise exception 'No client account with the email %.', v_email;
  end if;

  -- The next 2 open classes at least 3 days away with a free seat that the
  -- test client isn't already in
  select array_agg(id) into v_classes from (
    select s.id
    from public.class_sessions s
    where s.status = 'open'
      and s.date >= (now() at time zone 'Asia/Manila')::date + 3
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
    raise exception 'Not enough open classes with a free seat. Run select public.generate_sessions(9); first.';
  end if;

  -- 1. Confirmed and paid with GCash today (no not-pregnant answer, like a
  --    real online booking since Change 17)
  insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee,
                               discount, total, health_notes, agreed_at)
  values (v_classes[1], v_user, 'confirmed', true, null, 500, 50, 0, 550, 'R2 TEST', now())
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_booking, 'paymongo', 'gcash', 550, 'paid', 'R2TEST-' || v_booking, now());

  -- 2. A BPI transfer being checked (seat held for 1 day)
  insert into public.bookings (session_id, user_id, status, mat_rental, class_fee, mat_fee, discount, total,
                               health_notes, agreed_at, hold_expires_at)
  values (v_classes[2], v_user, 'pending_payment', false, 500, 0, 0, 500,
          'R2 TEST', now(), now() + interval '1 day')
  returning id into v_waiting;
  insert into public.payments (booking_id, provider, method, amount, screenshot_path)
  values (v_waiting, 'manual', 'bpi', 500, v_user || '/r2-test-screenshot.png');
  -- pending_payment -> awaiting_verification makes the "checking" update
  update public.bookings set status = 'awaiting_verification' where id = v_waiting;

  -- 3. Last month: a test class at 6:59 AM on the 10th, attended, paid by card
  insert into public.class_sessions (date, start_time, end_time, capacity)
  values (v_past_day, '06:59', '07:49', 4)
  on conflict (date, start_time) do nothing;
  select id into v_past from public.class_sessions where date = v_past_day and start_time = '06:59';
  insert into public.bookings (session_id, user_id, status, mat_rental, class_fee, mat_fee, discount, total,
                               health_notes, agreed_at)
  values (v_past, v_user, 'attended', false, 500, 0, 0, 500, 'R2 TEST', now() - interval '1 month')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at, created_at)
  values (v_booking, 'paymongo', 'card', 500, 'paid', 'R2TEST-' || v_booking,
          (v_past_day + time '08:00') at time zone 'Asia/Manila', (v_past_day + time '07:55') at time zone 'Asia/Manila');

  raise notice 'Made 3 test bookings and 3 payments for %.', v_email;
end;
$$;


-- -----------------------------------------------------------------------------
-- PART 3: what the transfer page and booking step 1 should offer
-- Every class from today to the end of NEXT month, with seats taken and the
-- test client's own bookings in it. Compare with the transfer page: every
-- open class with a free seat should be a chip + time there (yours greyed out).
-- -----------------------------------------------------------------------------
select s.date, s.start_time, s.status, s.capacity, public.seats_taken(s.id) as taken,
       public.booking_closes_at(s.date, s.start_time) as booking_closes,
       (select string_agg(b.status::text, ', ') from public.bookings b
          join public.profiles p on p.id = b.user_id
         where b.session_id = s.id
           and lower(p.email) = lower('your-test-client@example.com')) as my_bookings  -- CHANGE THIS
from public.class_sessions s
where s.date between (now() at time zone 'Asia/Manila')::date
                 and (date_trunc('month', (now() at time zone 'Asia/Manila')) + interval '2 months - 1 day')::date
order by s.date, s.start_time;


-- -----------------------------------------------------------------------------
-- PART 4: check the push (run once, after `npx supabase db push`)
-- Expected: book_seat has ONE version, without p_not_pregnant; next month
-- has classes; "weeks ahead" is 9; the new Home / About / agreement text is in.
-- -----------------------------------------------------------------------------
select p.oid::regprocedure as book_seat_versions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'book_seat';

select
  (select count(*) from public.class_sessions
    where date_trunc('month', date) = date_trunc('month', (now() at time zone 'Asia/Manila')) + interval '1 month') as next_month_classes,
  (select value from public.settings where key = 'sessions_weeks_ahead') as weeks_ahead,
  (select title from public.site_content where page = 'home' and section = 'hero') as home_headline,
  (select title from public.site_content where page = 'about' and section = 'instructor_name') as instructor,
  (select left(body, 40) from public.site_content where page = 'booking' and section = 'agreement') as agreement_starts;


-- -----------------------------------------------------------------------------
-- PART 5: Delete account, with a SECOND throwaway account
-- 1. Sign up a new account on the website (any gmail/yahoo address you own,
--    or a Google login), and finish its profile. Don't book anything.
-- 2. My Profile > Account Management > Delete: type DELETE (+ password).
-- 3. Then run this to see what was left (CHANGE THE EMAIL to the ORIGINAL one;
--    the profile row is gone for an account that never booked):
-- -----------------------------------------------------------------------------
select id, email, deleted_at
from auth.users
where lower(email) = lower('throwaway@gmail.com');  -- CHANGE THIS (expected: no row)
