-- =============================================================================
-- Step 10 manual test: SETUP (makes test bookings for My Account).
--
-- What it does:
--   Makes 4 TEST classes and gives your test client a confirmed, paid booking
--   in each one, so you can try every cancel / transfer rule on My Bookings:
--     30 hours away -> Transfer allowed; Cancel says "transfer instead"
--     18 hours away -> Cancel gives a 50% voucher
--      6 hours away -> Cancel gives no credit
--     40 hours away, CANCELLED BY THE CAFE -> free transfer box
--   Each booking gets a paid GCash payment (PayMongo reference starting with
--   "test_step10_"), so Payments and the receipt have something to show.
--
-- Safety:
--   - The test classes are 'closed' (or 'cancelled'), so no real client can
--     book them.
--   - Their start time ends in :07 seconds (real classes start on the
--     minute). That is how step10-cleanup.sql finds them again.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use:
--   1) Replace YOUR-TEST-CLIENT-EMAIL below with your test client's email.
--   2) Press Run. It should give back 4 rows. 0 rows = the email didn't match.
--   3) When you're done testing, run step10-cleanup.sql.
-- =============================================================================

with me as (
  -- Your test client's profile
  select id from public.profiles where email = 'YOUR-TEST-CLIENT-EMAIL'
),
slots (hours, class_status) as (
  -- How many hours from now each test class starts, and its status
  values (30, 'closed'), (18, 'closed'), (6, 'closed'), (40, 'cancelled')
),
times as (
  -- The start time in Philippine time, rounded to the minute, + 7 seconds (our marker)
  select class_status,
         date_trunc('minute', (now() + make_interval(hours => hours)) at time zone 'Asia/Manila') + interval '7 seconds' as t
  from slots
),
new_classes as (
  insert into public.class_sessions (date, start_time, end_time, capacity, status)
  select t::date, t::time,
         -- 50 minutes long, but never past midnight (end must be after start)
         case when t::time > '23:00' then '23:59:59'::time else (t + interval '50 minutes')::time end,
         4, class_status::public.session_status
  from times
  returning id
),
new_bookings as (
  -- One confirmed booking per test class: Iced Matcha + rented mat, 550 pesos
  insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice,
                               class_fee, mat_fee, discount, total, not_pregnant_confirmed, agreed_at)
  select c.id, me.id, 'confirmed', true, 'Iced Matcha', 500, 50, 0, 550, true, now()
  from new_classes c cross join me
  returning id
)
-- A paid GCash payment for each booking
insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref)
select id, 'paymongo', 'gcash', 550, 'paid', now(), 'test_step10_' || left(id::text, 8)
from new_bookings
returning booking_id;   -- 4 rows = it worked. 0 rows = check the email above.
