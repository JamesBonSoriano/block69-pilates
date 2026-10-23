-- =============================================================================
-- Change 17 (client revisions round 2) manual test: CLEANUP.
--
-- What it does:
--   Removes EVERY booking of your TEST CLIENT account (and the bookings they
--   were transferred to), their payments, their notifications, and the
--   personal 50% codes they got while testing. Their seats are free again.
--   Also removes the 6:59 AM "last month" test class made by r2-setup.sql
--   (only if nobody else is booked in it).
--   The test client's ACCOUNT stays. If PART 1 emptied their mobile number
--   and birthday, add them again on "Finish your profile" (or My Profile).
--   Settings, prices, page text and the real classes are NOT touched.
--
--   The fake screenshot path from r2-setup.sql has no real file, so there's
--   nothing to delete in Storage for it.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use: change the email in the first query, then press Run.
-- The last result should show 0, 0, 0 and 0.
-- =============================================================================

-- The test client (CHANGE THE EMAIL). Clients only, never an admin, and
-- never a deleted account.
create temp table r2_user as
  select id from public.profiles
  where lower(email) = lower('your-test-client@example.com') and role = 'client' and deleted_at is null;

-- Their bookings, plus (repeating) every booking made by transferring one of them
create temp table r2_bookings as
  with recursive family (id) as (
    select b.id from public.bookings b where b.user_id in (select id from r2_user)
    union
    select b.id from public.bookings b join family f on b.transferred_from = f.id
  )
  select id from family;

-- Notifications (also removed with their bookings, but some may have none)
delete from public.notifications where user_id in (select id from r2_user);

-- Payments first (they point at bookings), then the links between
-- transferred bookings, then the bookings (their admin notes go with them)
delete from public.payments where booking_id in (select id from r2_bookings);
update public.bookings set transferred_from = null where id in (select id from r2_bookings);
delete from public.bookings where id in (select id from r2_bookings);

-- The test client's personal 50% codes (from cancelling while testing)
delete from public.vouchers where owner_id in (select id from r2_user) and source = 'cancellation';

-- The 6:59 AM test class(es) from r2-setup.sql PART 2, if nobody is booked in them
delete from public.class_sessions s
where s.start_time = '06:59'
  and s.template_id is null
  and not exists (select 1 from public.bookings b where b.session_id = s.id);

-- Check: all four numbers should be 0
select
  (select count(*) from public.bookings where user_id in (select id from r2_user)) as test_client_bookings_left,
  (select count(*) from public.payments where booking_id in (select id from r2_bookings)) as test_payments_left,
  (select count(*) from public.notifications where user_id in (select id from r2_user)) as test_notifications_left,
  (select count(*) from public.class_sessions where start_time = '06:59' and template_id is null) as test_classes_left;

drop table r2_bookings;
drop table r2_user;
