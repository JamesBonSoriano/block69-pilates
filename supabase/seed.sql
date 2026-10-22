-- =============================================================================
-- seed.sql: SAMPLE DATA FOR TESTING ONLY. Never needed by the real website.
--
-- What this file adds:
--   - 3 sample clients (Bea, Carlo, Dana) who CAN'T log in (no password).
--     They only exist so the sample bookings have owners.
--   - A promo code WELCOME10 (10% off the class fee).
--   - One EXPIRED personal 50% code (Carlo's), and one valid one (Bea's).
--   - Sample bookings in all 10 statuses, with matching payments, spread over
--     two classes last Saturday and three upcoming classes.
--
-- Where it's used:
--   - `npm run test:db` loads it into the throwaway test database and checks it
--     (supabase/tests/06-seed.test.mjs).
--   - `npx supabase db reset` loads it into a LOCAL Supabase (needs Docker).
--   - `npx supabase db push` does NOT load it. Our live project only gets it if
--     someone runs `db push --include-seed`. Please don't: these fake bookings
--     would take real seats on the real Home page. (See supabase/tests/README.md.)
--
-- It needs migrations 1-4 first (tables, functions, default data and the
-- generated classes).
--
-- SAFE TO RUN TWICE: if Bea (the first sample client) already exists, the
-- whole file does nothing.
--
-- Note: rows are added directly as the database owner, so the booking rules
-- in book_seat() are skipped on purpose (for example, to make a booking that
-- is already 'attended'). The voucher trigger from migration 3 still runs.
-- =============================================================================

do $$
declare
  -- Fixed ids for the sample clients, so tests can find them.
  c_bea   constant uuid := '00000000-0000-4000-8000-00000000b0a1';
  c_carlo constant uuid := '00000000-0000-4000-8000-00000000ca71';
  c_dana  constant uuid := '00000000-0000-4000-8000-00000000da7a';

  v_today        date := public.manila_today();
  v_last_sat     date;  -- the most recent Saturday before today
  v_past_1       uuid;  -- last Saturday, 9:00 class
  v_past_2       uuid;  -- last Saturday, 10:15 class
  v_soon_1       uuid;  -- an upcoming class (ends up full while Dana's hold is live)
  v_soon_2       uuid;  -- the next upcoming class
  v_soon_3       uuid;  -- the one after that
  v_welcome10    uuid;  -- id of the WELCOME10 promo code
  v_booking      uuid;  -- id of the booking we just added (reused below)
  v_transfer_old uuid;  -- Dana's booking that was moved to another class
begin
  -- Already seeded? Then stop here, so nothing is added twice.
  if exists (select 1 from auth.users u where u.id = c_bea) then
    raise notice 'Sample data is already there; nothing added.';
    return;
  end if;

  -- ---------------------------------------------------------------------------
  -- SAMPLE CLIENTS
  -- Adding a row to auth.users fires the sign-up trigger from migration 1,
  -- which creates each person's profiles row (name and mobile from the
  -- metadata). No password is set, so nobody can log in as them.
  -- @example.com is a made-up email domain reserved for examples.
  -- ---------------------------------------------------------------------------
  insert into auth.users (id, email, raw_user_meta_data) values
    (c_bea,   'bea.sample@example.com',   '{"full_name": "Bea Santos (sample)",  "mobile": "0917 000 0001"}'),
    (c_carlo, 'carlo.sample@example.com', '{"full_name": "Carlo Reyes (sample)", "mobile": "0917 000 0002"}'),
    (c_dana,  'dana.sample@example.com',  '{"full_name": "Dana Cruz (sample)",   "mobile": "0917 000 0003"}');

  -- A few extra profile details, so My Profile has something to show.
  update public.profiles set instagram = '@bea.sample', birthday = '1998-04-12' where id = c_bea;
  -- Dana turned off reminder emails (My Account > Notifications).
  update public.profiles set email_reminders = false where id = c_dana;

  -- ---------------------------------------------------------------------------
  -- VOUCHERS
  -- ---------------------------------------------------------------------------
  -- WELCOME10: a promo code anyone can use, 10% off the class fee, 100 uses,
  -- never expires.
  insert into public.vouchers (code, percent_off, source, uses_left, expires_at)
  values ('WELCOME10', 10, 'promo', 100, null)
  returning id into v_welcome10;

  -- Carlo's personal 50% code from an old cancellation. It EXPIRED yesterday
  -- (it was issued 61 days ago and lasts 60 days), so it can't be used.
  insert into public.vouchers (code, percent_off, owner_id, source, uses_left, expires_at, created_at)
  values ('HALF-OLD001', 50, c_carlo, 'cancellation', 1, now() - interval '1 day', now() - interval '61 days');

  -- ---------------------------------------------------------------------------
  -- WHICH CLASSES TO USE
  -- ---------------------------------------------------------------------------
  -- Last Saturday (weekday 6) before today. (dow + 1) % 7 is how many days ago
  -- it was; 0 means today is Saturday, so go back a full week instead.
  v_last_sat := v_today - coalesce(nullif((extract(dow from v_today)::integer + 1) % 7, 0), 7);

  -- Two past classes last Saturday. (Generated classes start today, so these
  -- are added by hand, linked to the Saturday templates.)
  insert into public.class_sessions (template_id, date, start_time, end_time, capacity)
  select t.id, v_last_sat, t.start_time, t.end_time, t.default_capacity
  from public.schedule_templates t
  where t.weekday = 6
  on conflict (date, start_time) do nothing;

  select s.id into v_past_1 from public.class_sessions s where s.date = v_last_sat and s.start_time = '09:00';
  select s.id into v_past_2 from public.class_sessions s where s.date = v_last_sat and s.start_time = '10:15';

  -- Three upcoming classes, at least 2 days away (so they're still bookable).
  select s.id into v_soon_1 from public.class_sessions s
  where s.date >= v_today + 2 and s.status = 'open' order by s.date, s.start_time limit 1;
  select s.id into v_soon_2 from public.class_sessions s
  where s.date >= v_today + 2 and s.status = 'open' order by s.date, s.start_time offset 1 limit 1;
  select s.id into v_soon_3 from public.class_sessions s
  where s.date >= v_today + 2 and s.status = 'open' order by s.date, s.start_time offset 2 limit 1;

  if v_past_1 is null or v_soon_3 is null then
    raise exception 'seed.sql needs migration 4 first (templates and generated classes).';
  end if;

  -- ---------------------------------------------------------------------------
  -- BOOKINGS + PAYMENTS
  -- Every booking needs the not-pregnant tick and agreement time, and the
  -- money must add up: total = class_fee + mat_fee - discount.
  -- ---------------------------------------------------------------------------

  -- ===== Last Saturday, 9:00 class (already happened) =====

  -- 1. ATTENDED: Bea came. Paid 550 by GCash (class 500 + mat 50).
  insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                               first_time, health_notes, not_pregnant_confirmed, agreed_at)
  values (v_past_1, c_bea, 'attended', true, 'Iced Matcha', 500, 50, 550,
          true, 'Mild lower back pain.', true, now() - interval '10 days')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_booking, 'paymongo', 'gcash', 550, 'paid', 'pay_sample_0001', now() - interval '10 days');

  -- 2. NO_SHOW: Carlo paid by card but didn't come. No credit.
  insert into public.bookings (session_id, user_id, status, drink_choice, class_fee, total,
                               not_pregnant_confirmed, agreed_at)
  values (v_past_1, c_carlo, 'no_show', 'Americano', 500, 500, true, now() - interval '9 days')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_booking, 'paymongo', 'card', 500, 'paid', 'pay_sample_0002', now() - interval '9 days');

  -- 3. ATTENDED walk-in: added by the admin at the counter, paid cash.
  insert into public.bookings (session_id, walkin_name, walkin_contact, status, drink_choice, class_fee, total,
                               first_time, not_pregnant_confirmed, agreed_at)
  values (v_past_1, 'Ella Walk-in (sample)', '0917 000 0004', 'attended', 'Hot Matcha', 500, 500,
          true, true, now() - interval '7 days')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paid_at)
  values (v_booking, 'cash', 'cash', 500, 'paid', now() - interval '7 days');

  -- ===== Last Saturday, 10:15 class (already happened) =====

  -- 4. CANCELLED_WITH_VOUCHER: Bea cancelled 12-24 hours before and got a
  --    personal 50% code (valid 60 days, one use).
  insert into public.bookings (session_id, user_id, status, drink_choice, class_fee, total,
                               not_pregnant_confirmed, agreed_at)
  values (v_past_2, c_bea, 'cancelled_with_voucher', 'Hot Spanish Latte', 500, 500, true, now() - interval '12 days')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_booking, 'paymongo', 'gcash', 500, 'paid', 'pay_sample_0003', now() - interval '12 days');
  insert into public.vouchers (code, percent_off, owner_id, source, uses_left, expires_at, created_at)
  values ('HALF-BEA001', 50, c_bea, 'cancellation', 1, now() + interval '52 days', now() - interval '8 days');

  -- 5. FORFEITED: Dana cancelled less than 12 hours before. No credit.
  insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                               not_pregnant_confirmed, agreed_at)
  values (v_past_2, c_dana, 'forfeited', true, 'Decide at the cafe', 500, 50, 550, true, now() - interval '11 days')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_booking, 'paymongo', 'maya', 550, 'paid', 'pay_sample_0004', now() - interval '11 days');

  -- ===== Upcoming class 1 (4 seats: full while Dana's hold is live) =====

  -- 6. CONFIRMED with a voucher: Bea used WELCOME10 (10% off the class fee
  --    only): 500 - 50 = 450. Paid with Maya.
  --    (The trigger from migration 3 spends one WELCOME10 use: 100 -> 99.)
  insert into public.bookings (session_id, user_id, status, drink_choice, voucher_id, class_fee, discount, total,
                               not_pregnant_confirmed, agreed_at)
  values (v_soon_1, c_bea, 'confirmed', 'Iced Spanish Latte', v_welcome10, 500, 50, 450, true, now() - interval '2 days')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_booking, 'paymongo', 'maya', 450, 'paid', 'pay_sample_0005', now() - interval '2 days');

  -- 7. AWAITING_VERIFICATION: Carlo paid by manual GCash transfer and uploaded
  --    a screenshot. The seat stays held until the admin approves or rejects.
  --    (The screenshot file itself doesn't exist; it's only sample data.)
  insert into public.bookings (session_id, user_id, status, drink_choice, class_fee, total,
                               not_pregnant_confirmed, agreed_at, hold_expires_at)
  values (v_soon_1, c_carlo, 'awaiting_verification', 'Americano', 500, 500, true, now() - interval '3 hours',
          now() - interval '2 hours 45 minutes')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, screenshot_path)
  values (v_booking, 'manual', 'gcash', 500, 'pending', 'payment-screenshots/sample/carlo.png');

  -- 8. PENDING_PAYMENT: Dana clicked Pay and is on the PayMongo page right now.
  --    Her seat is held for 15 minutes from when this file runs; after that it
  --    stops counting by itself. Method is empty until she actually pays.
  insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                               first_time, not_pregnant_confirmed, agreed_at, hold_expires_at)
  values (v_soon_1, c_dana, 'pending_payment', true, 'Iced Matcha', 500, 50, 550,
          true, true, now(), now() + interval '15 minutes')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, amount, status, paymongo_ref)
  values (v_booking, 'paymongo', 550, 'pending', 'cs_sample_0006');

  -- 9. CONFIRMED walk-in, paid cash, rented a mat.
  insert into public.bookings (session_id, walkin_name, walkin_contact, status, mat_rental, drink_choice,
                               class_fee, mat_fee, total, not_pregnant_confirmed, agreed_at)
  values (v_soon_1, 'Fe Walk-in (sample)', '0917 000 0005', 'confirmed', true, 'Hot Matcha',
          500, 50, 550, true, now() - interval '1 day')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paid_at)
  values (v_booking, 'cash', 'cash', 550, 'paid', now() - interval '1 day');

  -- ===== Upcoming class 2 =====

  -- 10. EXPIRED: Dana's first try. She didn't pay within 15 minutes.
  insert into public.bookings (session_id, user_id, status, drink_choice, class_fee, total,
                               not_pregnant_confirmed, agreed_at, hold_expires_at)
  values (v_soon_2, c_dana, 'expired', 'Iced Matcha', 500, 500, true, now() - interval '4 days',
          now() - interval '4 days' + interval '15 minutes')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, amount, status, paymongo_ref)
  values (v_booking, 'paymongo', 500, 'expired', 'cs_sample_0007');

  -- 11. TRANSFERRED: Dana booked again and paid, then moved to class 3 (more
  --     than 24 hours before). The payment stays on this ORIGINAL booking.
  insert into public.bookings (session_id, user_id, status, drink_choice, class_fee, total,
                               not_pregnant_confirmed, agreed_at)
  values (v_soon_2, c_dana, 'transferred', 'Iced Matcha', 500, 500, true, now() - interval '4 days')
  returning id into v_transfer_old;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_transfer_old, 'paymongo', 'gcash', 500, 'paid', 'pay_sample_0008', now() - interval '4 days');

  -- ===== Upcoming class 3 =====

  -- 12. CONFIRMED (from the transfer): same inclusions and amounts, no new
  --     payment, and transferred_from points back to the original booking.
  insert into public.bookings (session_id, user_id, status, drink_choice, class_fee, total,
                               not_pregnant_confirmed, agreed_at, transferred_from)
  values (v_soon_3, c_dana, 'confirmed', 'Iced Matcha', 500, 500, true, now() - interval '4 days', v_transfer_old);

  -- 13. PAID_NEEDS_ACTION: Carlo's GCash payment arrived after his hold ended
  --     and the class had filled up. Shows at the top of the admin Dashboard.
  insert into public.bookings (session_id, user_id, status, drink_choice, class_fee, total,
                               not_pregnant_confirmed, agreed_at, hold_expires_at)
  values (v_soon_3, c_carlo, 'paid_needs_action', 'Americano', 500, 500, true, now() - interval '1 day',
          now() - interval '1 day' + interval '15 minutes')
  returning id into v_booking;
  insert into public.payments (booking_id, provider, method, amount, status, paymongo_ref, paid_at)
  values (v_booking, 'paymongo', 'gcash', 500, 'paid', 'pay_sample_0009', now() - interval '1 day' + interval '20 minutes');

  raise notice 'Sample data added: 3 clients, 3 vouchers, 13 bookings.';
end;
$$;
