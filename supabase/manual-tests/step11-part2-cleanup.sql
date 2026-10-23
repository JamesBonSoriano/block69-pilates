-- =============================================================================
-- Step 11 (part 2) manual test: CLEANUP (removes what
-- step11-part2-setup.sql made, and what you made while testing with it).
--
-- What it does:
--   Removes the 3 test classes (start time ending in :12 seconds), every
--   booking in them, every booking MOVED OUT of them (also moved twice, and
--   also into real classes, so their seats are free again), every walk-in
--   named "TEST ...", their payments and admin notes (booking_admin_actions
--   go with their bookings), the 50% codes the admin gave for these
--   bookings, and every voucher code starting with "TEST".
--   Settings, prices, page text, photos and the weekly schedule are NOT
--   touched: put those back by hand on the admin pages.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use: press Run. The last result should show 0, 0, 0 and 0.
-- =============================================================================

-- The test bookings: everything in the :12 test classes, plus walk-ins named
-- "TEST ...", plus (repeating) every booking made by transferring one of them
create temp table step11b_bookings as
  with recursive family (id) as (
    select b.id
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where extract(second from s.start_time) = 12
       or (b.user_id is null and b.walkin_name like 'TEST %')
    union
    select b.id from public.bookings b join family f on b.transferred_from = f.id
  )
  select id from family;

-- The 50% codes an admin gave for these bookings (before the notes go)
create temp table step11b_vouchers as
  select a.voucher_id as id
  from public.booking_admin_actions a
  where a.booking_id in (select id from step11b_bookings) and a.voucher_id is not null;

-- Payments first (they point at bookings), then the links between
-- transferred bookings, then the bookings (their admin notes go with them)
delete from public.payments where booking_id in (select id from step11b_bookings);
update public.bookings set transferred_from = null where id in (select id from step11b_bookings);
delete from public.bookings where id in (select id from step11b_bookings);

-- The codes: the admin's 50% codes for the test bookings, and TEST... promos
delete from public.vouchers where id in (select id from step11b_vouchers) or code like 'TEST%';

-- The test classes
delete from public.class_sessions where extract(second from start_time) = 12;

drop table step11b_bookings;
drop table step11b_vouchers;

-- Check: all four numbers should be 0
select
  (select count(*) from public.class_sessions where extract(second from start_time) = 12) as test_classes_left,
  (select count(*) from public.bookings where user_id is null and walkin_name like 'TEST %') as test_walkins_left,
  (select count(*) from public.payments where paymongo_ref like 'test_step11b_%') as test_payments_left,
  (select count(*) from public.vouchers where code like 'TEST%') as test_codes_left;
