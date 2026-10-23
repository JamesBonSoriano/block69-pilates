// Tests for migration 10, the admin setup pages (Step 11 part 2):
//   - only ACTIVE admins can call the 13 new functions (a client, a guest and
//     a deactivated admin are refused)
//   - admin_update_settings: good values are saved (and used by book_seat),
//     bad values are refused with a clear message
//   - promo codes: create, turn off (then nobody can use it), turn back on,
//     and the voucher list
//   - payments: the Review and Late tabs, filters, approve, and earnings
//   - one dated class: seats and open / closed, never below the seats taken
//   - users: search, deactivate / reactivate, roles, and an admin can never
//     change their OWN role or active status (not even with a direct update)
//   - Storage: only admins upload site photos or open payment screenshots
//   - the admin cancels or transfers ONE booking: the normal rule needs no
//     reason, an override does, the reason is saved where clients can't read
//     it, and a transfer can never overbook (two admins at the same moment)
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Admin setup pages: settings, vouchers, payments, schedule, users, storage, one-booking changes (migration 10)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, attempt, book, sessionIn, confirmedBooking, users } = t;
  await t.addUser('A');
  await t.addUser('B');
  await t.addUser('C');
  await t.addUser('admin', { admin: true });
  await t.addUser('admin2', { admin: true });
  await t.addUser('admin3', { admin: true });
  await q(`update public.profiles set full_name = 'Andrea Cruz', mobile = '+63 917 123 4567' where id = $1`, [users.A]);
  await q(`update public.profiles set full_name = 'Bianca Reyes', mobile = '0918 555 0000' where id = $1`, [users.B]);

  // Empty generated classes at least 3 days away (each test group takes its own).
  const S = await t.emptySessions(3);
  let next = 0;
  const freeClass = () => S[next++];

  // Adds a paid payment to a booking. Gives back the payment id.
  const pay = async (bookingId, method = 'gcash', amount = 550) => (await one(`
    insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref)
    values ($1, 'paymongo', $2, $3, 'paid', now(), 'pay_' || gen_random_uuid())
    returning id`, [bookingId, method, amount])).id;

  // Adds a walk-in booking directly (confirmed). Gives back the booking id.
  const walkIn = async (sessionId, name = 'Walk-in Wena') => (await one(`
    insert into public.bookings (session_id, walkin_name, walkin_contact, status, class_fee, total, not_pregnant_confirmed, agreed_at)
    values ($1, $2, '0917 777 8888', 'confirmed', 500, 500, true, now()) returning id`, [sessionId, name])).id;

  // ===========================================================================
  t.section('Only active admins');
  // ===========================================================================
  const someClass = freeClass();
  const someBooking = await confirmedBooking(someClass, 'A');
  const promoForCheck = (await one(`insert into public.vouchers (code, percent_off, source) values ('CHECKME', 10, 'promo') returning id`)).id;
  const calls = [
    ['admin_update_settings', `select public.admin_update_settings('{"class_price": 600}')`, []],
    ['admin_create_promo', `select public.admin_create_promo('TRYME', 10, 5)`, []],
    ['admin_set_promo_enabled', 'select public.admin_set_promo_enabled($1, false)', [promoForCheck]],
    ['admin_list_vouchers', 'select * from public.admin_list_vouchers()', []],
    ['admin_list_payments', 'select * from public.admin_list_payments()', []],
    ['admin_earnings', 'select * from public.admin_earnings(current_date - 7, current_date)', []],
    ['admin_update_session', `select * from public.admin_update_session($1, 3, 'open')`, [someClass]],
    ['admin_list_users', 'select * from public.admin_list_users()', []],
    ['admin_set_user_active', 'select public.admin_set_user_active($1, false)', [users.C]],
    ['admin_set_user_role', `select public.admin_set_user_role($1, 'admin')`, [users.C]],
    ['admin_booking_change_info', 'select * from public.admin_booking_change_info($1)', [someBooking]],
    ['admin_cancel_booking', `select * from public.admin_cancel_booking($1, 'no_credit', 'test')`, [someBooking]],
    ['admin_transfer_booking', 'select * from public.admin_transfer_booking($1, $2, $3)', [someBooking, S[S.length - 1], 'test']],
  ];
  for (const [name, sql, params] of calls) {
    const asClient = await attempt('A', sql, params);
    const asGuest = await attempt('guest', sql, params);
    const asAdmin = await attempt('admin', sql, params);
    check(`${name}: client, guest, admin`, 'client refused ("Only admins"), guest refused, admin allowed',
      !asClient.ok && asClient.err.includes('Only admins') && !asGuest.ok && asAdmin.ok,
      `client: ${asClient.err ?? 'ALLOWED'} | guest: ${asGuest.err ?? 'ALLOWED'} | admin: ${asAdmin.ok ? 'ok' : asAdmin.err}`);
  }
  await q('update public.profiles set is_active = false where id = $1', [users.admin3]);
  let r = await attempt('admin3', `select public.admin_update_settings('{"class_price": 1}')`);
  check('A deactivated admin changes the price', 'refused', !r.ok && r.err.includes('Only admins'), r.err ?? 'ALLOWED');
  r = await attempt('admin3', `select * from public.admin_cancel_booking($1, 'no_credit', 'x')`, [someBooking]);
  check('A deactivated admin cancels a booking', 'refused', !r.ok && r.err.includes('Only admins'), r.err ?? 'ALLOWED');
  r = await attempt('A', 'select public.admin_change_rule($1, current_date, $2, $3, null)', ['confirmed', '09:00', 'open']);
  const r2 = await attempt('A', `select public.admin_normal_action('voucher')`);
  check('Client calls the private rule helpers', 'both refused', !r.ok && !r2.ok, `${r.err} | ${r2.err}`);

  // ===========================================================================
  t.section('Settings and prices');
  // ===========================================================================
  const setting = async (key) => (await one('select value from public.settings where key = $1', [key])).value;
  r = await as('admin', `select public.admin_update_settings($1) as n`,
    [{ class_price: 550, mat_price: 60, cutoff_time: ' 07:30 ', cafe_phone: '  0917 123 4567 ', drink_options: [' Iced Matcha ', 'Americano', ''] }]);
  check('Save 5 settings at once', 'returns 5', r.ok && r.row.n === 5, r.ok ? r.row.n : r.err);
  check('Saved values are cleaned', 'cutoff "07:30", phone without spaces, drinks without blanks',
    (await setting('cutoff_time')) === '07:30' && (await setting('cafe_phone')) === '0917 123 4567'
      && JSON.stringify(await setting('drink_options')) === '["Iced Matcha","Americano"]',
    `${await setting('cutoff_time')} | ${await setting('cafe_phone')} | ${JSON.stringify(await setting('drink_options'))}`);
  const oldFee = (await one('select class_fee from public.bookings where id = $1', [someBooking])).class_fee;
  const newBooking = (await book('B', freeClass(), { mat: true, drink: 'Americano' })).row;
  check('A new booking after the price change', 'class fee 550.00 and mat 60.00 (from settings)',
    newBooking?.class_fee === '550.00' && newBooking.mat_fee === '60.00', newBooking && `${newBooking.class_fee}, ${newBooking.mat_fee}`);
  check('An existing booking after the price change', 'keeps its old class fee (500.00)', oldFee === '500.00', oldFee);
  check('The admin-only settings stay private', 'admin_alert_email is still not public',
    (await one(`select is_public from public.settings where key = 'admin_alert_email'`)).is_public === false, 'checked');

  const bad = [
    ['A price that is text', { class_price: 'abc' }, 'number'],
    ['A class price of 0', { class_price: 0 }, 'between'],
    ['A price with 3 decimals', { mat_price: 50.555 }, 'decimals'],
    ['A seat hold of 4 minutes', { hold_minutes: 4 }, 'between 5 and 60'],
    ['A seat hold of 15.5 minutes', { hold_minutes: 15.5 }, 'whole number'],
    ['A cutoff of "8am"', { cutoff_time: '8am' }, 'like 08:00'],
    ['The same drink twice', { drink_options: ['Americano', 'americano'] }, 'twice'],
    ['An empty drink list', { drink_options: [' '] }, 'between 1 and 12'],
    ['An http:// link', { chat_url: 'http://m.me/block69cafe' }, 'https://'],
    ['A wrong email', { cafe_email: 'block69cafe' }, 'email address'],
    ['An empty cafe name', { cafe_name: '  ' }, 'empty'],
    ['A setting that does not exist', { is_admin: true }, 'Unknown setting'],
    ['Nothing at all', {}, 'nothing to save'],
  ];
  for (const [label, values, word] of bad) {
    r = await attempt('admin', 'select public.admin_update_settings($1)', [values]);
    check(label, `refused ("${word}")`, !r.ok && r.err.toLowerCase().includes(word.toLowerCase()), r.err ?? 'ALLOWED');
  }
  r = await as('admin', `select public.admin_update_settings($1)`, [{ chat_url: '', manual_payment_enabled: false }]);
  check('An empty link and the manual-payment switch', 'saved (empty hides the link)',
    r.ok && (await setting('chat_url')) === '' && (await setting('manual_payment_enabled')) === false, r.err ?? 'saved');

  // ===========================================================================
  t.section('Promo codes');
  // ===========================================================================
  const today = (await one(`select public.manila_today()::text as d`)).d;
  r = await as('admin', `select public.admin_create_promo(' summer20 ', 20, 5, $1::date + 10) as id`, [today]);
  const summer = r.row?.id;
  const saved = await one(`select code, percent_off, uses_left, source,
    expires_at = public.at_manila($1::date + 11, '00:00') as ends_right from public.vouchers where id = $2`, [today, summer]);
  check('Create " summer20 ", 20%, 5 uses, last day in 10 days', 'saved as SUMMER20 promo, works until the end of that day',
    saved?.code === 'SUMMER20' && saved.percent_off === '20.00' && saved.uses_left === 5 && saved.source === 'promo' && saved.ends_right,
    saved && `${saved.code}, ${saved.percent_off}, ${saved.uses_left}, ${saved.source}, end ok ${saved.ends_right}`);
  const badPromos = [
    ['The same code again', `select public.admin_create_promo('Summer20', 10, 1)`, 'already exists'],
    ['A code starting with HALF-', `select public.admin_create_promo('HALF-1234', 10, 1)`, 'HALF-'],
    ['A code with a space', `select public.admin_create_promo('SUMMER 20', 10, 1)`, 'no spaces'],
    ['0% off', `select public.admin_create_promo('ZERO', 0, 1)`, 'more than 0'],
    ['101% off', `select public.admin_create_promo('TOOMUCH', 101, 1)`, 'at most 100'],
    ['0 uses', `select public.admin_create_promo('NOUSE', 10, 0)`, 'Total uses'],
    ['A last day in the past', `select public.admin_create_promo('OLD', 10, 1, current_date - 3)`, 'past'],
  ];
  for (const [label, sql, word] of badPromos) {
    r = await attempt('admin', sql);
    check(label, `refused ("${word}")`, !r.ok && r.err.includes(word), r.err ?? 'ALLOWED');
  }

  r = await attempt('A', 'select * from public.check_voucher($1)', ['summer20']);
  check('Client checks SUMMER20 while it is on', 'accepted', r.ok && r.rows.length === 1, r.err ?? 'accepted');
  await as('admin', 'select public.admin_set_promo_enabled($1, false)', [summer]);
  r = await attempt('A', 'select * from public.check_voucher($1)', ['SUMMER20']);
  check('Client checks SUMMER20 after it is turned off', 'refused "no longer active"', !r.ok && r.err.includes('no longer active'), r.err ?? 'ALLOWED');
  r = await book('A', freeClass(), { code: 'SUMMER20' });
  check('Client books with the turned-off code', 'refused (book_seat checks it too)', !r.ok && r.err.includes('no longer active'), r.err ?? 'ALLOWED');
  let vouchers = (await attempt('admin', 'select * from public.admin_list_vouchers()')).rows;
  check('The voucher list while it is off', "SUMMER20's state is 'off'", vouchers.find((v) => v.voucher_id === summer)?.state === 'off',
    vouchers.find((v) => v.voucher_id === summer)?.state);
  await as('admin', 'select public.admin_set_promo_enabled($1, true)', [summer]);
  r = await attempt('A', 'select * from public.check_voucher($1)', ['SUMMER20']);
  check('Turned back on', 'accepted again', r.ok && r.rows.length === 1, r.err ?? 'accepted');

  const personal = (await one(`insert into public.vouchers (code, percent_off, owner_id, source, expires_at)
    values ('HALF-ABC123', 50, $1, 'cancellation', now() + interval '60 days') returning id`, [users.A])).id;
  r = await attempt('admin', 'select public.admin_set_promo_enabled($1, false)', [personal]);
  check("Turn off a client's personal 50% code", 'refused (only promo codes)', !r.ok && r.err.includes('Only promo codes'), r.err ?? 'ALLOWED');
  vouchers = (await attempt('admin', 'select * from public.admin_list_vouchers()')).rows;
  const pv = vouchers.find((v) => v.voucher_id === personal);
  check('The personal code in the voucher list', "listed as a cancellation code with Andrea's name, active",
    pv?.source === 'cancellation' && pv.owner_name === 'Andrea Cruz' && pv.state === 'active', pv && `${pv.source}, ${pv.owner_name}, ${pv.state}`);

  // ===========================================================================
  t.section('Payments');
  // ===========================================================================
  // A's paid GCash booking (with mat), B's manual BPI transfer waiting for a
  // check, and a late Maya payment (paid after the class filled up).
  const paidBooking = await confirmedBooking(freeClass(), 'A');
  const paidPay = await pay(paidBooking, 'gcash', 550);
  const waiting = (await one(`
    insert into public.bookings (session_id, user_id, status, class_fee, total, not_pregnant_confirmed, agreed_at, hold_expires_at)
    values ($1, $2, 'awaiting_verification', 500, 500, true, now(), now() + interval '10 minutes') returning id`, [freeClass(), users.B])).id;
  const manualPay = (await one(`insert into public.payments (booking_id, provider, method, amount, screenshot_path)
    values ($1, 'manual', 'bpi', 500, 'b/screenshot.png') returning id`, [waiting])).id;
  const lateBooking = (await one(`
    insert into public.bookings (session_id, user_id, status, class_fee, total, not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'paid_needs_action', 500, 500, true, now()) returning id`, [freeClass(), users.B])).id;
  const latePay = await pay(lateBooking, 'maya', 500);

  const payments = async (args) => {
    const res = await attempt('admin', `select * from public.admin_list_payments(
      p_view => $1, p_status => $2, p_method => $3, p_from => $4, p_to => $5, p_search => $6)`,
    [args.view ?? 'all', args.status ?? null, args.method ?? null, args.from ?? null, args.to ?? null, args.search ?? null]);
    if (!res.ok) throw new Error(res.err);
    return res.rows;
  };
  let rows = await payments({ view: 'review' });
  check('Needs review tab', 'only the manual BPI transfer, with its screenshot path',
    rows.length === 1 && rows[0].payment_id === manualPay && rows[0].screenshot_path === 'b/screenshot.png', `${rows.length} rows`);
  rows = await payments({ view: 'late' });
  check('Paid needs action tab', 'only the late Maya payment', rows.length === 1 && rows[0].payment_id === latePay, `${rows.length} rows`);
  rows = await payments({ method: 'gcash', search: 'andrea' });
  check('Filter GCash + search "andrea"', "Andrea's GCash payment", rows.length === 1 && rows[0].payment_id === paidPay && rows[0].guest_name === 'Andrea Cruz',
    `${rows.length} rows`);
  rows = await payments({ status: 'pending' });
  check('Filter status pending', 'only the manual transfer', rows.length === 1 && rows[0].payment_id === manualPay, `${rows.length} rows`);
  rows = await payments({ from: today, to: today });
  check("Today's dates", 'all 3 test payments', [paidPay, manualPay, latePay].every((id) => rows.some((x) => x.payment_id === id)), `${rows.length} rows`);
  r = await attempt('admin', `select * from public.admin_list_payments(p_view => 'other')`);
  check('A made-up tab', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('admin', `select * from public.admin_list_payments(p_method => 'paypal')`);
  check('A made-up method', 'refused', !r.ok && r.err.includes('Unknown'), r.err ?? 'ALLOWED');

  r = await as('admin', 'select public.admin_review_manual_payment($1, true) as s', [manualPay]);
  const reviewed = await one('select status, verified_by from public.payments where id = $1', [manualPay]);
  check('Approve the BPI screenshot', 'booking confirmed, payment paid, verified by the admin',
    r.row?.s === 'confirmed' && reviewed.status === 'paid' && reviewed.verified_by === users.admin, `${r.row?.s ?? r.err}, ${reviewed.status}`);
  rows = await payments({ view: 'review' });
  check('Needs review tab after approving', 'empty', rows.length === 0, `${rows.length} rows`);

  const expected = await one(`
    select sum(p.amount)::text as amount, sum(least(b.mat_fee, p.amount))::text as mats
    from public.payments p join public.bookings b on b.id = p.booking_id
    where p.status = 'paid' and (p.paid_at at time zone 'Asia/Manila')::date = $1::date`, [today]);
  rows = (await attempt('admin', 'select * from public.admin_earnings($1::date, $1::date)', [today])).rows;
  const sum = (key) => rows.reduce((n, x) => n + Number(x[key]), 0).toFixed(2);
  check("Today's earnings", `${expected.amount} received, ${expected.mats} of it mat rental`,
    sum('amount') === Number(expected.amount).toFixed(2) && sum('mat_amount') === Number(expected.mats).toFixed(2),
    `${sum('amount')}, mats ${sum('mat_amount')}`);
  r = await attempt('admin', 'select * from public.admin_earnings(current_date - 500, current_date)');
  check('Earnings for 500 days', 'refused (at most 400)', !r.ok && r.err.includes('400'), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('One dated class (Schedule)');
  // ===========================================================================
  const cls = freeClass();
  await confirmedBooking(cls, 'A');
  await confirmedBooking(cls, 'B');
  const update = (id, cap, status) => attempt('admin', 'select * from public.admin_update_session($1, $2, $3)', [id, cap, status]);
  r = await update(cls, 1, 'open');
  check('Seats below the 2 already taken', 'refused', !r.ok && r.err.includes('already taken'), r.err ?? 'ALLOWED');
  r = await update(cls, 51, 'open');
  check('51 seats', 'refused', !r.ok && r.err.includes('between 1 and 50'), r.err ?? 'ALLOWED');
  r = await update(cls, 3, 'cancelled');
  check("Status 'cancelled' here", 'refused (use Cancel class)', !r.ok && r.err.includes('Cancel class'), r.err ?? 'ALLOWED');
  r = await as('admin', `select * from public.admin_update_session($1, 2, 'closed')`, [cls]);
  check('Change to 2 seats and closed', 'saved, 2 seats taken', r.ok && r.row.capacity === 2 && r.row.status === 'closed' && r.row.seats_taken === 2,
    r.ok ? JSON.stringify(r.row) : r.err);
  r = await book('C', cls);
  check('Client books the closed class', 'refused', !r.ok, r.err ?? 'ALLOWED');
  await as('admin', `select * from public.admin_update_session($1, 3, 'open')`, [cls]);
  r = await book('C', cls);
  check('Re-opened with 3 seats: client books', 'allowed (the 3rd seat)', r.ok, r.err ?? 'ok');
  const ended = await sessionIn(-2);
  r = await update(ended, 4, 'open');
  check('A class that already ended', 'refused', !r.ok && r.err.includes('ended'), r.err ?? 'ALLOWED');
  await q(`update public.class_sessions set status = 'cancelled' where id = $1`, [cls]);
  r = await update(cls, 4, 'open');
  check('A cancelled class', 'refused', !r.ok && r.err.includes('cancelled'), r.err ?? 'ALLOWED');
  r = await attempt('admin', 'select public.generate_sessions(4) as n');
  const rc = await attempt('A', 'select public.generate_sessions(4) as n');
  check('"Create classes" button (generate_sessions)', 'admin allowed, client refused', r.ok && !rc.ok && rc.err.includes('Only admins'),
    `admin ${r.ok ? `ok (${r.row.n} new)` : r.err} | client ${rc.err ?? 'ALLOWED'}`);

  // ===========================================================================
  t.section('Users');
  // ===========================================================================
  rows = (await attempt('admin', `select * from public.admin_list_users('andrea')`)).rows;
  check('Search "andrea"', 'only Andrea, not "is_me"', rows.length === 1 && rows[0].user_id === users.A && !rows[0].is_me, `${rows.length} rows`);
  rows = (await attempt('admin', `select * from public.admin_list_users('0918 555 0000')`)).rows;
  check('Search by mobile', 'Bianca', rows.length === 1 && rows[0].user_id === users.B, `${rows.length} rows`);
  rows = (await attempt('admin', `select * from public.admin_list_users(p_role => 'admin')`)).rows;
  const me = rows.find((x) => x.user_id === users.admin);
  check('Only admins, as the admin', 'the 3 admins; my own row has is_me', rows.length === 3 && me?.is_me === true, `${rows.length} rows`);
  r = await attempt('admin', `select * from public.admin_list_users(p_role => 'boss')`);
  check('A made-up role filter', 'refused', !r.ok, r.err ?? 'ALLOWED');

  r = await attempt('admin', 'select public.admin_set_user_active($1, false)', [users.admin]);
  check('Admin deactivates themself (function)', 'refused', !r.ok && r.err.includes('your own'), r.err ?? 'ALLOWED');
  r = await attempt('admin', `select public.admin_set_user_role($1, 'client')`, [users.admin]);
  check('Admin removes their own admin role (function)', 'refused', !r.ok && r.err.includes('your own'), r.err ?? 'ALLOWED');
  r = await attempt('admin', `update public.profiles set role = 'client' where id = $1`, [users.admin]);
  check('Admin removes their own admin role (direct update)', 'refused by the profile guard', !r.ok && r.err.includes('your own'), r.err ?? 'ALLOWED');
  r = await attempt('admin', `update public.profiles set is_active = false where id = $1`, [users.admin]);
  check('Admin deactivates themself (direct update)', 'refused by the profile guard', !r.ok && r.err.includes('your own'), r.err ?? 'ALLOWED');
  r = await attempt('admin', `update public.profiles set full_name = 'New Name' where id = $1 returning id`, [users.admin]);
  check('Admin edits their own name', 'allowed (only role and active are guarded)', r.ok && r.rows.length === 1, r.err ?? 'ok');

  await as('admin', 'select public.admin_set_user_active($1, false)', [users.C]);
  r = await book('C', freeClass());
  check('Deactivated client books', 'refused', !r.ok && r.err.includes('deactivated'), r.err ?? 'ALLOWED');
  await as('admin', 'select public.admin_set_user_active($1, true)', [users.C]);
  r = await attempt('C', 'select public.is_admin() as yes');
  check('Reactivated client', 'can use the site again, still not an admin', r.ok && r.row.yes === false, r.err ?? `admin ${r.row.yes}`);
  await as('admin', `select public.admin_set_user_role($1, 'admin')`, [users.C]);
  r = await attempt('C', 'select public.is_admin() as yes');
  check('Admin makes C an admin', 'C is an admin now', r.ok && r.row.yes === true, r.err ?? `admin ${r.row.yes}`);
  r = await attempt('C', `select public.admin_set_user_role($1, 'client')`, [users.admin]);
  check('The new admin C changes the first admin back to client', 'allowed (it is someone else)', r.ok, r.err ?? 'ok');
  await as('admin', `select public.admin_set_user_role($1, 'client')`, [users.C]);
  r = await attempt('admin', `select public.admin_set_user_active(gen_random_uuid(), false)`);
  check('An account that does not exist', 'refused', !r.ok && r.err.includes("couldn't find"), r.err ?? 'ALLOWED');
  r = await attempt('B', 'select public.deactivate_my_account()');
  check('A client still deactivates their own account (My Profile)', 'allowed (the guard only stops browser updates)', r.ok, r.err ?? 'ok');

  // ===========================================================================
  t.section('Storage (photos and payment screenshots)');
  // ===========================================================================
  const buckets = await q(`select id, public from storage.buckets order by id`);
  check('The two buckets', 'payment-screenshots private, site-images public',
    buckets.map((b) => `${b.id}:${b.public}`).join(',') === 'payment-screenshots:false,site-images:true',
    buckets.map((b) => `${b.id}:${b.public}`).join(','));
  const upload = (actor, bucket, name) =>
    attempt(actor, `insert into storage.objects (bucket_id, name) values ($1, $2) returning id`, [bucket, name]);
  r = await upload('admin', 'site-images', 'home/hero.jpg');
  const ru = await upload('A', 'site-images', 'home/hero.jpg');
  const rg = await upload('guest', 'site-images', 'home/hero.jpg');
  check('Upload a site photo', 'admin allowed, client and guest refused', r.ok && !ru.ok && !rg.ok,
    `admin ${r.ok ? 'ok' : r.err} | client ${ru.err ?? 'ALLOWED'} | guest ${rg.err ?? 'ALLOWED'}`);
  await q(`insert into storage.objects (bucket_id, name) values ('site-images', 'about/cafe.jpg'), ('payment-screenshots', 'b/screenshot.png')`);
  const del = async (actor) => (await attempt(actor, `delete from storage.objects where bucket_id = 'site-images' and name = 'about/cafe.jpg' returning id`));
  r = await del('admin');
  const rd = await del('A');
  check('Delete a site photo', 'admin allowed, client deletes nothing', r.ok && r.rows.length === 1 && (!rd.ok || rd.rows.length === 0),
    `admin ${r.ok ? `${r.rows.length} row` : r.err} | client ${rd.ok ? `${rd.rows.length} rows` : rd.err}`);
  const see = async (actor) => {
    const res = await attempt(actor, `select id from storage.objects where bucket_id = 'payment-screenshots'`);
    return res.ok ? res.rows.length : -1;
  };
  const seen = [await see('admin'), await see('A'), await see('B'), await see('guest')];
  check('Open a payment screenshot', 'admin sees it; clients A and B and a guest see nothing',
    seen[0] === 1 && seen.slice(1).every((n) => n <= 0), `admin ${seen[0]}, A ${seen[1]}, B ${seen[2]}, guest ${seen[3]}`);
  r = await upload('A', 'payment-screenshots', 'a/fake.png');
  check('Client uploads a screenshot now', 'refused (that policy comes in Step 12)', !r.ok, r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Admin cancels one booking');
  // ===========================================================================
  // Classes at set distances from now: 2 days (transfer rule), 18 hours
  // (50% code rule), 6 hours (no credit rule). Different hours so no two
  // classes get the same date and time.
  const in48 = await sessionIn(48);
  const in49 = await sessionIn(49);
  const in18 = await sessionIn(18);
  const in6 = await sessionIn(6);
  const cancel = (id, outcome, note = null) => attempt('admin', 'select * from public.admin_cancel_booking($1, $2, $3)', [id, outcome, note]);
  const cancelKeep = (id, outcome, note = null) => as('admin', 'select * from public.admin_cancel_booking($1, $2, $3)', [id, outcome, note]);
  const info = async (id) => (await attempt('admin', 'select * from public.admin_booking_change_info($1)', [id])).row;

  const far = await confirmedBooking(in48, 'A');
  let i = await info(far);
  check('Info for a booking 2 days away', 'can change, rule transfer, normal action transfer, voucher allowed',
    i?.can_change && i.rule === 'transfer' && i.normal_action === 'transfer' && i.voucher_allowed && i.actions.length === 0,
    i && `${i.can_change}, ${i.rule}, ${i.normal_action}, ${i.voucher_allowed}`);
  r = await cancel(far, 'voucher');
  check('Cancel with a 50% code, 2 days away, no reason', 'refused (an override needs a reason)', !r.ok && r.err.includes('reason'), r.err ?? 'ALLOWED');
  r = await cancel(far, 'voucher', '   ');
  check('Same, with only spaces as the reason', 'refused', !r.ok && r.err.includes('reason'), r.err ?? 'ALLOWED');
  r = await cancel(far, 'voucher', 'x'.repeat(501));
  check('Same, with a 501-character reason', 'refused (500 max)', !r.ok && r.err.includes('500'), r.err ?? 'ALLOWED');
  r = await cancel(far, 'refund', 'test');
  check('A made-up outcome ("refund")', 'refused', !r.ok && r.err.includes('Please choose'), r.err ?? 'ALLOWED');
  r = await cancelKeep(far, 'voucher', '  Client moved abroad, cafe agreed to credit.  ');
  const v = r.row?.voucher_code
    ? await one('select owner_id, percent_off, uses_left, source from public.vouchers where code = $1', [r.row.voucher_code]) : null;
  check('Same, WITH a reason', "cancelled with voucher, override, a HALF- code for Andrea (50%, 1 use)",
    r.ok && r.row.new_status === 'cancelled_with_voucher' && r.row.overridden === true && /^HALF-[0-9A-F]{6}$/.test(r.row.voucher_code)
      && v?.owner_id === users.A && v.percent_off === '50.00' && v.uses_left === 1 && v.source === 'cancellation',
    r.ok ? `${r.row.new_status}, override ${r.row.overridden}, ${r.row.voucher_code}` : r.err);
  i = await info(far);
  const act = i?.actions?.[0];
  check('The saved admin change', 'one action: cancel_voucher, normal rule transfer, override, reason trimmed, by Test admin, the code',
    i && !i.can_change && i.rule === null && i.actions.length === 1 && act.action === 'cancel_voucher' && act.normal_rule === 'transfer'
      && act.overridden && act.note === 'Client moved abroad, cafe agreed to credit.' && act.admin_name === 'Test admin' && act.voucher_code === r.row?.voucher_code,
    act && `${act.action}, ${act.normal_rule}, ${act.overridden}, "${act.note}", ${act.admin_name}`);
  r = await cancel(far, 'no_credit', 'again');
  check('Cancel the same booking again', 'refused (only confirmed bookings)', !r.ok && r.err.includes('Only confirmed'), r.err ?? 'ALLOWED');

  const mid = await confirmedBooking(in18, 'A');
  r = await cancel(mid, 'voucher');
  check('Cancel with a 50% code, 18 hours away, no reason', 'allowed (that IS the rule), not an override',
    r.ok && r.row.new_status === 'cancelled_with_voucher' && r.row.overridden === false, r.ok ? `${r.row.new_status}, ${r.row.overridden}` : r.err);
  r = await cancel(mid, 'no_credit');
  check('Cancel with no credit, 18 hours away, no reason', 'refused (giving less than the rule is an override too)', !r.ok && r.err.includes('reason'), r.err ?? 'ALLOWED');

  const near = await confirmedBooking(in6, 'A');
  r = await cancel(near, 'no_credit');
  check('Cancel with no credit, 6 hours away, no reason', 'allowed: forfeited, not an override',
    r.ok && r.row.new_status === 'forfeited' && r.row.voucher_code === null && r.row.overridden === false, r.ok ? `${r.row.new_status}` : r.err);
  r = await cancel(near, 'voucher', 'Sick, sent a doctor note');
  check('Cancel with a 50% code, 6 hours away, with a reason', 'allowed as an override',
    r.ok && r.row.new_status === 'cancelled_with_voucher' && r.row.overridden === true, r.ok ? `${r.row.new_status}, ${r.row.overridden}` : r.err);

  const walk = await walkIn(in18);
  i = await info(walk);
  check('Info for a walk-in', 'voucher not allowed', i?.voucher_allowed === false, i && i.voucher_allowed);
  r = await cancel(walk, 'voucher');
  check('Give a walk-in a 50% code', 'refused (no account)', !r.ok && r.err.includes('Walk-ins'), r.err ?? 'ALLOWED');

  const hold = (await book('B', in49)).row?.booking_id;
  r = await cancel(hold, 'no_credit', 'test');
  check('Cancel an unpaid hold', 'refused', !r.ok && r.err.includes('Only confirmed'), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Admin transfers one booking');
  // ===========================================================================
  const transfer = (id, to, note = null) => attempt('admin', 'select * from public.admin_transfer_booking($1, $2, $3)', [id, to, note]);
  const transferKeep = (id, to, note = null) => as('admin', 'select * from public.admin_transfer_booking($1, $2, $3)', [id, to, note]);
  const target = freeClass();

  const move = await confirmedBooking(in49, 'A');
  await pay(move, 'card', 550);
  r = await transferKeep(move, target);
  const moved = r.row?.new_booking_id;
  const nb = moved ? await one('select * from public.bookings where id = $1', [moved]) : null;
  check('Transfer 2 days ahead, no reason', 'allowed, not an override; new confirmed booking with the same fees, mat and drink',
    r.ok && r.row.overridden === false && nb?.status === 'confirmed' && nb.transferred_from === move && nb.user_id === users.A
      && nb.total === '550.00' && nb.mat_rental && nb.drink_choice === 'Iced Matcha' && (await t.status(move)) === 'transferred',
    r.ok ? `${nb?.status}, from old ${nb?.transferred_from === move}, ${nb?.total}` : r.err);
  i = await info(moved);
  check('Info for the new booking', 'rule already_transferred (no normal action), the transfer is listed',
    i?.rule === 'already_transferred' && i.normal_action === null && i.actions.length === 1 && i.actions[0].action === 'transfer'
      && i.actions[0].new_booking_id === moved && i.actions[0].note === null,
    i && `${i.rule}, ${i.normal_action}, ${i.actions.length} action(s)`);
  const target2 = freeClass();
  r = await transfer(moved, target2);
  check('Transfer it a 2nd time, no reason', 'refused (once only, unless a reason)', !r.ok && r.err.includes('reason'), r.err ?? 'ALLOWED');
  r = await transfer(moved, target2, 'Cafe moved the instructor schedule');
  check('Transfer it a 2nd time, with a reason', 'allowed as an override', r.ok && r.row.overridden === true, r.ok ? `${r.row.overridden}` : r.err);

  const soon = await confirmedBooking(in18, 'B');
  r = await transfer(soon, target);
  check('Transfer 18 hours before class, no reason', 'refused', !r.ok && r.err.includes('reason'), r.err ?? 'ALLOWED');
  r = await transfer(soon, target, 'Client asked nicely');
  check('Transfer 18 hours before class, with a reason', 'allowed as an override', r.ok && r.row.overridden === true, r.ok ? `${r.row.overridden}` : r.err);

  const walk2 = await walkIn(in48, 'Walk-in Wally');
  r = await transferKeep(walk2, target);
  const wb = r.row?.new_booking_id ? await one('select * from public.bookings where id = $1', [r.row.new_booking_id]) : null;
  check('Transfer a walk-in', 'allowed; the new booking keeps the walk-in name and contact',
    r.ok && wb?.user_id === null && wb.walkin_name === 'Walk-in Wally' && wb.walkin_contact === '0917 777 8888', r.ok ? `${wb?.walkin_name}` : r.err);

  // A late payment that used a 1-use promo code (the trigger spent it on insert).
  const promo1 = (await one(`insert into public.vouchers (code, percent_off, source, uses_left) values ('ONCE', 10, 'promo', 1) returning id`)).id;
  const late = (await one(`
    insert into public.bookings (session_id, user_id, status, voucher_id, class_fee, discount, total, not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'paid_needs_action', $3, 500, 50, 450, true, now()) returning id`, [in6, users.C, promo1])).id;
  const usesBefore = (await one('select uses_left from public.vouchers where id = $1', [promo1])).uses_left;
  i = await info(late);
  check('Info for a late payment', "rule 'late_payment', normal action transfer", i?.rule === 'late_payment' && i.normal_action === 'transfer',
    i && `${i.rule}, ${i.normal_action}`);
  r = await transferKeep(late, target);
  const lateNew = r.row?.new_booking_id ? await one('select status, discount, total from public.bookings where id = $1', [r.row.new_booking_id]) : null;
  const usesAfter = (await one('select uses_left from public.vouchers where id = $1', [promo1])).uses_left;
  check('Transfer the late payment, no reason', 'allowed; confirmed in the new class with the same discount; the code is NOT spent twice',
    r.ok && r.row.overridden === false && lateNew?.status === 'confirmed' && lateNew.total === '450.00' && usesBefore === 0 && usesAfter === 0,
    r.ok ? `${lateNew?.status}, ${lateNew?.total}, uses ${usesBefore} -> ${usesAfter}` : r.err);

  // Things a transfer never skips, even with a reason.
  const another = await confirmedBooking(in48, 'B');
  r = await transfer(another, in48, 'x');
  check('Transfer into the same class', 'refused', !r.ok && r.err.includes('different class'), r.err ?? 'ALLOWED');
  const full = await sessionIn(50, 1);
  await confirmedBooking(full, 'C');
  r = await transfer(another, full, 'Please squeeze them in');
  check('Transfer into a full class (with a reason)', 'refused: never overbook', !r.ok && r.err.includes('full'), r.err ?? 'ALLOWED');
  const closed = freeClass();
  await q(`update public.class_sessions set status = 'closed' where id = $1`, [closed]);
  r = await transfer(another, closed, 'x');
  check('Transfer into a closed class', 'refused', !r.ok && r.err.includes('not open'), r.err ?? 'ALLOWED');
  r = await transfer(another, ended, 'x');
  check('Transfer into a class that ended', 'refused', !r.ok, r.err ?? 'ALLOWED');
  const withB = freeClass();
  await confirmedBooking(withB, 'B');
  r = await transfer(another, withB, 'x');
  check('Transfer B into a class B is already in', 'refused', !r.ok && r.err.includes('already has a booking'), r.err ?? 'ALLOWED');
  r = await transfer(another, '00000000-0000-0000-0000-000000000000', 'x');
  check('Transfer into a class that does not exist', 'refused', !r.ok && r.err.includes("couldn't find"), r.err ?? 'ALLOWED');

  // Two admins move two different people into the LAST seat at the same moment.
  const lastSeat = await sessionIn(51, 1);
  const p1 = await confirmedBooking(in48, 'A');
  const p2 = await confirmedBooking(in49, 'C');
  const admins = ['admin', 'admin2'];
  const conns = await Promise.all(admins.map(() => t.connect()));
  await Promise.all(conns.map(async (c, n) => { await c.query('begin'); await t.setActor(c, admins[n]); }));
  const race = await Promise.all(conns.map(async (c, n) => {
    try {
      await c.query('select * from public.admin_transfer_booking($1, $2)', [[p1, p2][n], lastSeat]);
      await c.query('select pg_sleep(0.3)');  // hold the lock a moment, so the other has to wait
      await c.query('commit');
      return { ok: true };
    } catch (e) {
      await c.query('rollback');
      return { ok: false, err: e.message };
    }
  }));
  await Promise.all(conns.map((c) => c.end()));
  const taken = (await one('select public.seats_taken($1) as n', [lastSeat])).n;
  check('Two admins, one last seat, same moment', 'one transfer works, the other is told the class is full, 1 seat taken',
    race.filter((x) => x.ok).length === 1 && race.some((x) => !x.ok && x.err.includes('full')) && taken === 1,
    race.map((x) => (x.ok ? 'ok' : x.err)).join(' | ') + `, taken ${taken}`);

  // ===========================================================================
  t.section('The admin notes are private');
  // ===========================================================================
  const notesSql = 'select id, note from public.booking_admin_actions';
  const asAdmin = await attempt('admin', notesSql);
  const asA = await attempt('A', notesSql);
  const asGuest = await attempt('guest', notesSql);
  check('Read the admin notes', 'admin sees them; client A (whose bookings they are) sees none; guest refused',
    asAdmin.ok && asAdmin.rows.length >= 5 && asA.ok && asA.rows.length === 0 && !asGuest.ok,
    `admin ${asAdmin.rows?.length}, A ${asA.rows?.length ?? asA.err}, guest ${asGuest.err ?? 'ALLOWED'}`);
  r = await attempt('A', `insert into public.booking_admin_actions (booking_id, action, normal_rule, overridden) values ($1, 'transfer', 'transfer', false) returning id`, [someBooking]);
  const ra = await attempt('admin', `update public.booking_admin_actions set note = 'changed' returning id`);
  check('Add or change an admin note directly', 'client refused, admin refused too (only the functions add them)', !r.ok && !ra.ok,
    `client ${r.err ?? 'ALLOWED'} | admin ${ra.err ?? 'ALLOWED'}`);
  r = await attempt('server', `insert into public.booking_admin_actions (booking_id, action, normal_rule, overridden) values ($1, 'transfer', 'voucher', true) returning id`, [someBooking]);
  check('An override saved without a reason (even by the server)', 'refused by the table check', !r.ok && r.err.includes('override_needs_note'), r.err ?? 'ALLOWED');
}
