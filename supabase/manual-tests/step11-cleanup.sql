-- =============================================================================
-- Step 11 (part 1) manual test: CLEANUP (removes what step11-setup.sql made).
--
-- What it does:
--   Removes the 4 test classes (start time ending in :11 seconds), every
--   booking in them, any booking your test client TRANSFERRED out of them
--   (e.g. the free transfer after "Cancel class"), every walk-in whose name
--   starts with "TEST " (also ones you added to real classes while testing),
--   and all of their payments. Nothing else is touched.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use: press Run. The last result should show 0, 0 and 0.
-- =============================================================================

-- The test bookings: everything in the :11 test classes...
create temp table step11_bookings as
  select b.id
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  where extract(second from s.start_time) = 11;

-- ...plus the walk-ins named "TEST ..." in any class...
insert into step11_bookings
  select b.id from public.bookings b
  where b.user_id is null
    and b.walkin_name like 'TEST %'
    and b.id not in (select id from step11_bookings);

-- ...plus the new bookings made by transferring out of them
insert into step11_bookings
  select b.id from public.bookings b
  where b.transferred_from in (select id from step11_bookings)
    and b.id not in (select id from step11_bookings);

-- Payments first (they point at bookings), then the links between
-- transferred bookings, then the bookings themselves
delete from public.payments where booking_id in (select id from step11_bookings);
update public.bookings set transferred_from = null where id in (select id from step11_bookings);
delete from public.bookings where id in (select id from step11_bookings);

-- The test classes
delete from public.class_sessions where extract(second from start_time) = 11;

drop table step11_bookings;

-- Check: all three numbers should be 0
select
  (select count(*) from public.class_sessions where extract(second from start_time) = 11) as test_classes_left,
  (select count(*) from public.bookings where user_id is null and walkin_name like 'TEST %') as test_walkins_left,
  (select count(*) from public.payments where paymongo_ref like 'test_step11_%') as test_payments_left;
