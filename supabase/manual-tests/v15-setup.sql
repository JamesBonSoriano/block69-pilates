-- =============================================================================
-- Version 1.5 manual test: SETUP (test data for the click-through).
--
-- What it makes (all TEST classes are 'closed', so no real client can book
-- them; their start time ends in :15 seconds, which is how v15-cleanup.sql
-- finds them):
--   A. A class that ENDED about 2 hours ago, never marked:
--        your test client (paid GCash) + walk-ins "TEST V15 Bea" and
--        "TEST V15 Carlo" (paid cash), all still 'confirmed'
--        -> admin Bookings > Needs action: 3 x "Pending Attendance Verification"
--   B. 4 past classes (2, 3, 4 and 5 days ago):
--        12 walk-ins "TEST V15 Attended 01..12" (attended) and
--        4 walk-ins "TEST V15 No-show 1..4" (no-show)
--        -> Attended chip: 12 bookings = 2 pages of 10; No-show chip: 4
--   C. Two classes the CAFE cancelled, each with your test client booked:
--        C1. class 29 days ago, cancelled 31 days ago -> the free move ends
--            TOMORROW ("Move by <tomorrow>") with the 30-day window
--        C2. class 40 days ago, cancelled 45 days ago -> the window is over
--            ("Class cancelled" under Past, no Transfer button)
--        The database's own trigger adds the "Class cancelled by the cafe"
--        update to your bell for each.
--   (If you changed "Rescheduling window (days)" on admin Settings, put it
--   back to 30 first, or the "tomorrow" date will be different.)
--
-- Where it's used: paste it into the Supabase SQL Editor by hand. It is NOT a
-- migration and is never run by `npx supabase db push`.
--
-- How to use:
--   1) Put your test CLIENT's email and your ADMIN email in the two lines
--      marked "<- your ... email" below.
--   2) Press Run. The last result shows what was made (3 / 16 / 2 ...).
--      "Test client email not found" = fix the email and run again.
--   3) When you're done testing, run v15-cleanup.sql.
-- =============================================================================

do $$
declare
  v_client uuid;   -- your test client
  v_admin  uuid;   -- your admin (records the walk-ins' cash)
  -- Now and today in the Philippines (class dates and times are Manila time)
  v_now    timestamp := now() at time zone 'Asia/Manila';
  v_today  date      := (now() at time zone 'Asia/Manila')::date;
  v_start  timestamp;
  v_cls    uuid;
  v_b      uuid;
  v_day    integer;
  i        integer;
begin
  select id into v_client from public.profiles where email = 'YOUR-TEST-CLIENT-EMAIL';             -- <- your test client's email
  select id into v_admin  from public.profiles where email = 'YOUR-ADMIN-EMAIL' and role = 'admin'; -- <- your admin email
  if v_client is null then
    raise exception 'Test client email not found. Put your test client''s email in the setup and run again.';
  end if;

  -- ---------------------------------------------------------------------------
  -- A. A class that ended about 2 hours ago (started 3 hours ago), not marked
  -- ---------------------------------------------------------------------------
  v_start := date_trunc('minute', v_now - interval '3 hours') + interval '15 seconds';
  insert into public.class_sessions (date, start_time, end_time, capacity, status)
  values (v_start::date, v_start::time,
          -- 50 minutes, but never past midnight
          case when v_start::time > '23:00' then '23:59:59'::time else (v_start + interval '50 minutes')::time end,
          4, 'closed')
  returning id into v_cls;

  -- Your test client: confirmed, paid online (GCash test reference)
  insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice,
                               class_fee, mat_fee, discount, total, agreed_at)
  values (v_cls, v_client, 'confirmed', true, 'Iced Matcha', 500, 50, 0, 550, now())
  returning id into v_b;
  insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref)
  values (v_b, 'paymongo', 'gcash', 550, 'paid', now(), 'test_v15_' || left(v_b::text, 8));

  -- Two walk-ins: confirmed, paid cash
  for i in 1..2 loop
    insert into public.bookings (session_id, walkin_name, walkin_contact, status, mat_rental, drink_choice,
                                 class_fee, mat_fee, discount, total, not_pregnant_confirmed, agreed_at)
    values (v_cls, case i when 1 then 'TEST V15 Bea' else 'TEST V15 Carlo' end, '0917 000 151' || i,
            'confirmed', false, 'Hot Matcha', 500, 0, 0, 500, true, now())
    returning id into v_b;
    insert into public.payments (booking_id, provider, method, amount, status, paid_at, verified_by)
    values (v_b, 'cash', 'cash', 500, 'paid', now(), v_admin);
  end loop;

  -- ---------------------------------------------------------------------------
  -- B. Attended (12, over 3 classes) and No-show (4) walk-ins, 2 to 5 days ago
  -- ---------------------------------------------------------------------------
  for v_day in 2..5 loop
    insert into public.class_sessions (date, start_time, end_time, capacity, status)
    values (v_today - v_day, '09:00:15', '09:50:15', 4, 'closed')
    returning id into v_cls;
    for i in 1..4 loop
      insert into public.bookings (session_id, walkin_name, walkin_contact, status, mat_rental, drink_choice,
                                   class_fee, mat_fee, discount, total, not_pregnant_confirmed, agreed_at)
      values (v_cls,
              -- days 2-4: attended (numbered 01..12); day 5: no-shows
              case when v_day < 5 then 'TEST V15 Attended ' || lpad(((v_day - 2) * 4 + i)::text, 2, '0')
                   else 'TEST V15 No-show ' || i end,
              '0917 000 1500',
              case when v_day < 5 then 'attended' else 'no_show' end::public.booking_status,
              false, 'Americano', 500, 0, 0, 500, true, now())
      returning id into v_b;
      insert into public.payments (booking_id, provider, method, amount, status, paid_at, verified_by)
      values (v_b, 'cash', 'cash', 500, 'paid', now(), v_admin);
    end loop;
  end loop;

  -- ---------------------------------------------------------------------------
  -- C. Two classes the cafe cancelled, with your test client booked
  -- ---------------------------------------------------------------------------
  -- (Made 'open' with the booking first, then cancelled, so the database's
  -- trigger tells your client exactly like a real "Cancel class" does. The
  -- cancelled_at given here is kept by the stamp trigger.)
  for i in 1..2 loop
    insert into public.class_sessions (date, start_time, end_time, capacity, status)
    values (v_today - case i when 1 then 29 else 40 end, '10:15:15', '11:05:15', 4, 'open')
    returning id into v_cls;
    insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice,
                                 class_fee, mat_fee, discount, total, agreed_at)
    values (v_cls, v_client, 'confirmed', false, 'Iced Spanish Latte', 500, 0, 0, 500, now())
    returning id into v_b;
    insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref)
    values (v_b, 'paymongo', 'gcash', 500, 'paid', now(), 'test_v15_' || left(v_b::text, 8));
    update public.class_sessions
    set status = 'cancelled',
        cancelled_at = now() - case i when 1 then interval '31 days' else interval '45 days' end
    where id = v_cls;
  end loop;
end;
$$;

-- What was made (expected: 3 pending attendance, 12 attended, 4 no-show,
-- 2 cancelled classes, and the first one's last day = tomorrow)
select
  (select count(*) from public.bookings b join public.class_sessions s on s.id = b.session_id
    where extract(second from s.start_time) = 15 and b.status = 'confirmed' and s.status = 'closed') as pending_attendance,
  (select count(*) from public.bookings where walkin_name like 'TEST V15 Attended%' and status = 'attended') as attended,
  (select count(*) from public.bookings where walkin_name like 'TEST V15 No-show%' and status = 'no_show') as no_show,
  (select count(*) from public.class_sessions where extract(second from start_time) = 15 and status = 'cancelled') as cancelled_classes,
  (select min(public.free_move_last_day(cancelled_at, date)) filter (where date > public.manila_today() - 35)
     from public.class_sessions where extract(second from start_time) = 15 and status = 'cancelled') as move_by_tomorrow;
