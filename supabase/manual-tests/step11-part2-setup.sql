-- =============================================================================
-- Step 11 (part 2) manual test: SETUP (test data for the admin setup pages
-- and for the admin's Cancel / Transfer of one booking).
--
-- What it does:
--   Makes 3 TEST classes and puts bookings in them:
--     +48h  in 2 days:
--             A  your test client, confirmed, paid GCash
--                -> booking details: "Cancel or transfer" (Transfer = normal
--                   rule; Cancel with a 50% code = override, needs a reason)
--             B  your test client, waiting for a BPI screenshot check
--                -> Payments "Needs review": Approve
--             C  your test client, waiting for a GCash transfer check
--                -> Payments "Needs review": Reject
--             D  your test client, "paid, needs action" (late Maya payment)
--                -> Payments "Paid, needs action" -> Move or cancel
--             E  walk-in "TEST Wally", paid cash
--                -> the 50% code choice is greyed out (walk-ins have no account)
--     +18h  in 18 hours: your test client, confirmed (50% code = normal rule)
--     +6h   in 6 hours:  your test client, confirmed (no credit = normal rule)
--   Paid payments use PayMongo test references starting with "test_step11b_".
--
-- Safety:
--   - The test classes are 'closed', so no real client can book them online.
--     (You can still move a test booking OUT of them into a real class.)
--   - Their start time ends in :12 seconds (part 1 used :11). That is how
--     step11-part2-cleanup.sql finds them, plus every booking moved out of
--     them, every walk-in named "TEST ...", and every voucher code starting
--     with "TEST" or made for these test bookings.
--   - Promo codes you create while testing: start them with TEST (e.g.
--     TEST20) and the cleanup removes them.
--   - Settings, prices, page text and the weekly schedule are NOT reset by
--     the cleanup. Write down the old values before you change them.
--   - The screenshots are pretend paths. To see a real picture on the review
--     card, upload any image in the dashboard: Storage -> payment-screenshots
--     -> Create folder "test-step11b" -> upload it as "bpi.png" (and
--     "gcash.png"). Without that, the card says the file couldn't be found.
--   - Best run during the day (Philippine time): the "+6h" class must not
--     land after midnight.
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use:
--   1) Put your test client's email and your admin email in the two lines
--      marked "<- your ... email" just below.
--   2) Press Run. The result should say: 7 test bookings, 7 payments.
--      If it stops with "Test client not found", fix the email.
--   3) When you're done testing, run step11-part2-cleanup.sql.
-- =============================================================================

do $$
declare
  v_client uuid := (select id from public.profiles where email = 'YOUR-TEST-CLIENT-EMAIL');                 -- <- your test client's email
  v_admin  uuid := (select id from public.profiles where email = 'YOUR-ADMIN-EMAIL' and role = 'admin');    -- <- your admin email
  v_price  numeric := public.setting_number('class_price');   -- today's prices from settings
  v_mat    numeric := public.setting_number('mat_price');
  v_class  jsonb := '{}';   -- class name -> class id
  v_slot   record;
  v_guest  record;
  v_id     uuid;
  v_start  timestamp;
begin
  if v_client is null then
    raise exception 'Test client not found. Check the email at the top.';
  end if;

  -- The 3 test classes (closed, start time + 12 seconds = our marker)
  for v_slot in select * from (values ('in2days', 48), ('in18h', 18), ('in6h', 6)) as s(name, hours) loop
    v_start := date_trunc('minute', (now() + make_interval(secs => v_slot.hours * 3600)) at time zone 'Asia/Manila')
               + interval '12 seconds';
    insert into public.class_sessions (date, start_time, end_time, capacity, status)
    values (
      v_start::date, v_start::time,
      -- 50 minutes long, but never past midnight (end must be after start)
      case when v_start::time > '23:00' then '23:59:59'::time else (v_start + interval '50 minutes')::time end,
      6, 'closed'
    )
    returning id into v_id;
    v_class := v_class || jsonb_build_object(v_slot.name, v_id);
  end loop;

  -- The test bookings, each with one payment:
  --   provider paymongo -> paid, with a test_step11b_ reference
  --   provider manual   -> a pending transfer with a pretend screenshot
  --   provider cash     -> paid cash, recorded by your admin account
  for v_guest in
    select * from (values
      ('in2days', null,         null,            'confirmed',             'paymongo', 'gcash', 'Iced Matcha', true,  null),
      ('in2days', null,         null,            'awaiting_verification', 'manual',   'bpi',   'Hot Matcha',  false, 'test-step11b/bpi.png'),
      ('in2days', null,         null,            'awaiting_verification', 'manual',   'gcash', 'Americano',   false, 'test-step11b/gcash.png'),
      ('in2days', null,         null,            'paid_needs_action',     'paymongo', 'maya',  'Iced Matcha', false, null),
      ('in2days', 'TEST Wally', '0917 000 4444', 'confirmed',             'cash',     'cash',  'Americano',   true,  null),
      ('in18h',   null,         null,            'confirmed',             'paymongo', 'card',  'Hot Matcha',  false, null),
      ('in6h',    null,         null,            'confirmed',             'paymongo', 'gcash', 'Iced Matcha', true,  null)
    ) as g(slot, walkin_name, walkin_contact, status, provider, method, drink, mat, screenshot)
  loop
    insert into public.bookings (session_id, user_id, walkin_name, walkin_contact, status, mat_rental, drink_choice,
                                 class_fee, mat_fee, discount, total, not_pregnant_confirmed, agreed_at, hold_expires_at)
    values (
      (v_class ->> v_guest.slot)::uuid,
      -- No walk-in name = your test client's own booking
      case when v_guest.walkin_name is null then v_client end,
      v_guest.walkin_name, v_guest.walkin_contact,
      v_guest.status::public.booking_status, v_guest.mat, v_guest.drink,
      v_price, case when v_guest.mat then v_mat else 0 end, 0,
      v_price + case when v_guest.mat then v_mat else 0 end,
      true, now(),
      -- (a booking waiting for a screenshot check keeps an old hold time; it still holds its seat)
      case when v_guest.status = 'awaiting_verification' then now() - interval '5 minutes' end
    )
    returning id into v_id;

    insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref, screenshot_path, verified_by)
    values (
      v_id,
      v_guest.provider::public.payment_provider,
      v_guest.method::public.payment_method,
      v_price + case when v_guest.mat then v_mat else 0 end,
      case when v_guest.provider = 'manual' then 'pending' else 'paid' end::public.payment_status,
      case when v_guest.provider = 'manual' then null else now() end,
      case when v_guest.provider = 'paymongo' then 'test_step11b_' || left(v_id::text, 8) end,
      v_guest.screenshot,
      case when v_guest.provider = 'cash' then v_admin end
    );
  end loop;
end;
$$;

-- Check: should say 7 test bookings, 7 payments
select
  (select count(*) from public.bookings b join public.class_sessions s on s.id = b.session_id
    where extract(second from s.start_time) = 12) as test_bookings,
  (select count(*) from public.payments p join public.bookings b on b.id = p.booking_id
    join public.class_sessions s on s.id = b.session_id
    where extract(second from s.start_time) = 12) as test_payments;
