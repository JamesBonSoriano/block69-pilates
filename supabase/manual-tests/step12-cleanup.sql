-- =============================================================================
-- Step 12 manual test: CLEANUP (removes what you made while testing payments).
--
-- What it does:
--   Removes EVERY booking of your TEST CLIENT account (and the bookings they
--   were transferred to), their payments (PayMongo test payments and manual
--   transfers), the admin notes on them (they go with the bookings), the
--   personal 50% codes the test client got, and the "TEST late filler"
--   walk-ins made by step12-setup.sql. Their seats are free again.
--   The test client's ACCOUNT stays (delete it in Authentication > Users if
--   you want). Settings, prices, page text and classes are NOT touched.
--
--   Screenshot FILES are not removed by SQL (Supabase only lets the Storage
--   page delete files): Storage > payment-screenshots > the folder named by
--   the test client's user id > select > Delete.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use: change the email in the first query, then press Run.
-- The last result should show 0, 0 and 0.
-- =============================================================================

-- The test client (CHANGE THE EMAIL)
create temp table step12_user as
  select id from public.profiles where lower(email) = lower('your-test-client@example.com');

-- Their bookings, plus (repeating) every booking made by transferring one of
-- them, plus the walk-ins that filled a class for the late payment test
create temp table step12_bookings as
  with recursive family (id) as (
    select b.id from public.bookings b
    where b.user_id in (select id from step12_user)
       or (b.user_id is null and b.walkin_name like 'TEST late filler %')
    union
    select b.id from public.bookings b join family f on b.transferred_from = f.id
  )
  select id from family;

-- Payments first (they point at bookings), then the links between
-- transferred bookings, then the bookings (their admin notes go with them)
delete from public.payments where booking_id in (select id from step12_bookings);
update public.bookings set transferred_from = null where id in (select id from step12_bookings);
delete from public.bookings where id in (select id from step12_bookings);

-- The test client's personal 50% codes (from cancelling while testing)
delete from public.vouchers where owner_id in (select id from step12_user) and source = 'cancellation';

-- Check: all three numbers should be 0
select
  (select count(*) from public.bookings where user_id in (select id from step12_user)) as test_client_bookings_left,
  (select count(*) from public.bookings where user_id is null and walkin_name like 'TEST late filler %') as fillers_left,
  (select count(*) from public.payments where booking_id in (select id from step12_bookings)) as test_payments_left;

drop table step12_bookings;
drop table step12_user;
