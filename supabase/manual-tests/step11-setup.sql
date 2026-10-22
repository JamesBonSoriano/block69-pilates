-- =============================================================================
-- Step 11 (part 1) manual test: SETUP (test data for the admin pages).
--
-- What it does:
--   Makes 4 TEST classes and fills them, so every admin page has something
--   to show:
--     NOW      started 30 minutes ago (still running): your test client
--              (confirmed, first time, a health note) + 2 walk-ins
--              -> Dashboard "Today's classes", Attendance (mark them!)
--     -24h     yesterday: your test client + 1 walk-in, NOT marked yet
--              -> Dashboard "Needs action: Mark attendance", late marking
--     +48h     in 2 days: a booking waiting for a BPI screenshot check, and a
--              "paid, needs action" late payment (both your test client)
--              -> Dashboard "Needs action", Bookings "Needs action" chip
--     +72h     in 3 days: your test client (confirmed, paid)
--              -> try "Cancel class" on it, then see the free transfer as
--                 the client in My Bookings
--   Paid payments: GCash for your client (PayMongo reference starting with
--   "test_step11_"), cash for the walk-ins (recorded by your admin account).
--
-- Safety:
--   - The test classes are 'closed', so no real client can book them online.
--   - Their start time ends in :11 seconds (real classes start on the minute,
--     and Step 10 used :07). That is how step11-cleanup.sql finds them.
--   - Every walk-in name starts with "TEST ". If you add a walk-in to a REAL
--     class while testing, name it "TEST something" too and the cleanup
--     removes it.
--   - Best run during the day (Philippine time): near midnight the "started
--     30 minutes ago" class can land on yesterday.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use:
--   1) Put your test client's email and your admin email in the two lines
--      marked "<- your ... email" just below.
--   2) Press Run. It should give back 8 rows (one payment per test booking).
--      0 rows = the client email didn't match. (If the ADMIN email doesn't
--      match, it still works, but the walk-in cash shows no "recorded by".)
--   3) When you're done testing, run step11-cleanup.sql.
-- =============================================================================

with me as (
  -- Your test client's profile
  select id from public.profiles where email = 'YOUR-TEST-CLIENT-EMAIL'   -- <- your test client's email
),
admin as (
  -- Your admin profile (records the walk-ins' cash)
  select id from public.profiles where email = 'YOUR-ADMIN-EMAIL' and role = 'admin'   -- <- your admin email
),
slots (slot, hours) as (
  -- Each test class: a name for it, and how many hours from now it starts
  values ('now', -0.5), ('yesterday', -24), ('in2days', 48), ('in3days', 72)
),
times as (
  -- The start time in Philippine time, rounded to the minute, + 11 seconds (our marker)
  select slot,
         date_trunc('minute', (now() + make_interval(secs => hours * 3600)) at time zone 'Asia/Manila')
           + interval '11 seconds' as t
  from slots
),
new_classes as (
  insert into public.class_sessions (date, start_time, end_time, capacity, status)
  select t::date, t::time,
         -- 50 minutes long, but never past midnight (end must be after start)
         case when t::time > '23:00' then '23:59:59'::time else (t + interval '50 minutes')::time end,
         4, 'closed'
  from times
  returning id, date, start_time
),
classes as (
  -- Match each new class back to its name (now / yesterday / in2days / in3days)
  select c.id, x.slot
  from new_classes c
  join times x on x.t::date = c.date and x.t::time = c.start_time
),
guests (slot, who, name, contact, status, drink, mat, first_time, notes) as (
  -- Who is booked where. who = 'me' (your test client) or 'walkin'.
  values
    ('now',       'me',     null,          null,            'confirmed',             'Iced Matcha',        true,  true,  'TEST: sore left knee'),
    ('now',       'walkin', 'TEST Carla',  '0917 000 1111', 'confirmed',             'Hot Spanish Latte',  true,  false, null),
    ('now',       'walkin', 'TEST Dina',   '0917 000 2222', 'confirmed',             'Decide at the cafe', false, true,  null),
    ('yesterday', 'me',     null,          null,            'confirmed',             'Americano',          false, false, null),
    ('yesterday', 'walkin', 'TEST Ana',    '0917 000 3333', 'confirmed',             'Iced Matcha',        true,  false, null),
    ('in2days',   'me',     null,          null,            'awaiting_verification', 'Hot Matcha',         false, false, null),
    ('in2days',   'me',     null,          null,            'paid_needs_action',     'Iced Matcha',        false, false, null),
    ('in3days',   'me',     null,          null,            'confirmed',             'Iced Spanish Latte', true,  false, null)
),
new_bookings as (
  insert into public.bookings (session_id, user_id, walkin_name, walkin_contact, status, mat_rental, drink_choice,
                               class_fee, mat_fee, discount, total, first_time, health_notes,
                               not_pregnant_confirmed, agreed_at, hold_expires_at)
  select c.id,
         case when g.who = 'me' then me.id end,
         g.name, g.contact, g.status::public.booking_status, g.mat, g.drink,
         500, case when g.mat then 50 else 0 end, 0, 500 + case when g.mat then 50 else 0 end,
         g.first_time, g.notes, true, now(),
         -- (a booking waiting for a screenshot check keeps an old hold time; it still holds its seat)
         case when g.status = 'awaiting_verification' then now() - interval '5 minutes' end
  from guests g
  join classes c on c.slot = g.slot
  cross join me
  returning id, user_id, status, total
)
-- One payment per booking:
--   walk-ins            -> paid cash, recorded by your admin account
--   awaiting check      -> a pending BPI transfer with a (pretend) screenshot
--   everyone else       -> paid GCash (PayMongo test reference)
insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref, screenshot_path, verified_by)
select b.id,
       case when b.user_id is null then 'cash' when b.status = 'awaiting_verification' then 'manual' else 'paymongo' end::public.payment_provider,
       case when b.user_id is null then 'cash' when b.status = 'awaiting_verification' then 'bpi' else 'gcash' end::public.payment_method,
       b.total,
       case when b.status = 'awaiting_verification' then 'pending' else 'paid' end::public.payment_status,
       case when b.status = 'awaiting_verification' then null else now() end,
       case when b.user_id is not null and b.status <> 'awaiting_verification' then 'test_step11_' || left(b.id::text, 8) end,
       case when b.status = 'awaiting_verification' then 'test/step11-screenshot.png' end,
       case when b.user_id is null then (select id from admin) end
from new_bookings b
returning booking_id;   -- 8 rows = it worked
