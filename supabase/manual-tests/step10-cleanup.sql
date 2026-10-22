-- =============================================================================
-- Step 10 manual test: CLEANUP (removes what step10-setup.sql made).
--
-- What it does:
--   Removes the 4 test classes (start time ending in :07 seconds), every
--   booking in them, any booking you TRANSFERRED out of them (into a real
--   class), their payments, and the 50% vouchers your test cancels made in
--   the last day (only unused ones). Your other bookings are not touched.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use:
--   1) Replace YOUR-TEST-CLIENT-EMAIL below with the same email you used in
--      step10-setup.sql.
--   2) Press Run. The last result should show 0 and 0.
-- =============================================================================

-- The test bookings (in the :07 test classes)...
create temp table step10_bookings as
  select b.id
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  where extract(second from s.start_time) = 7;

-- ...plus the new bookings made by transferring out of them
insert into step10_bookings
  select b.id from public.bookings b
  where b.transferred_from in (select id from step10_bookings)
    and b.id not in (select id from step10_bookings);

-- Payments first (they point at bookings), then the links between
-- transferred bookings, then the bookings themselves
delete from public.payments where booking_id in (select id from step10_bookings);
update public.bookings set transferred_from = null where id in (select id from step10_bookings);
delete from public.bookings where id in (select id from step10_bookings);

-- The 50% codes from your test cancels (made in the last day, never used)
delete from public.vouchers v
where v.source = 'cancellation'
  and v.owner_id = (select id from public.profiles where email = 'YOUR-TEST-CLIENT-EMAIL')
  and v.created_at > now() - interval '1 day'
  and not exists (select 1 from public.bookings b where b.voucher_id = v.id);

-- The test classes
delete from public.class_sessions where extract(second from start_time) = 7;

drop table step10_bookings;

-- Check: both numbers should be 0
select
  (select count(*) from public.class_sessions where extract(second from start_time) = 7) as test_classes_left,
  (select count(*) from public.payments where paymongo_ref like 'test_step10_%') as test_payments_left;
