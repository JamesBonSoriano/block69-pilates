-- =============================================================================
-- Version 1.5 manual test: CLEANUP (removes what v15-setup.sql made).
--
-- What it does:
--   Removes the TEST classes (start time ending in :15 seconds), every
--   booking in them, any booking your test client MOVED out of them (the
--   free move from a cancelled class lands in a real class), every walk-in
--   whose name starts with "TEST V15", and all of their payments. Their bell
--   updates go too (they belong to the deleted bookings). Nothing else is
--   touched.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use: press Run. The last result should show 0, 0, 0 and 0.
-- =============================================================================

-- The test bookings: everything in the :15 test classes...
create temp table v15_bookings as
  select b.id
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  where extract(second from s.start_time) = 15;

-- ...plus the walk-ins named "TEST V15 ..." in any class...
insert into v15_bookings
  select b.id from public.bookings b
  where b.user_id is null
    and b.walkin_name like 'TEST V15%'
    and b.id not in (select id from v15_bookings);

-- ...plus the new bookings made by moving out of them (one step is enough:
-- a moved booking can't be moved again)
insert into v15_bookings
  select b.id from public.bookings b
  where b.transferred_from in (select id from v15_bookings)
    and b.id not in (select id from v15_bookings);

-- Payments first (they point at bookings), then the links between moved
-- bookings, then the bookings themselves (their notifications go with them)
delete from public.payments where booking_id in (select id from v15_bookings);
update public.bookings set transferred_from = null where id in (select id from v15_bookings);
delete from public.bookings where id in (select id from v15_bookings);

-- The test classes
delete from public.class_sessions where extract(second from start_time) = 15;

drop table v15_bookings;

-- Check: all four numbers should be 0
select
  (select count(*) from public.class_sessions where extract(second from start_time) = 15) as test_classes_left,
  (select count(*) from public.bookings where user_id is null and walkin_name like 'TEST V15%') as test_walkins_left,
  (select count(*) from public.payments where paymongo_ref like 'test_v15_%') as test_payments_left,
  (select count(*) from public.notifications n
    where not exists (select 1 from public.bookings b where b.id = n.booking_id) and n.booking_id is not null) as orphan_updates_left;
