// Tests for migration 9, the admin's daily pages (Step 11 part 1):
//   - only ACTIVE admins can call the 5 new read-only functions (a client, a
//     guest and a deactivated admin are refused)
//   - admin_list_sessions: seats taken / left match seats_left(), past and
//     cancelled classes are listed, "to mark" counts the right bookings
//   - admin_class_rosters: who is in a class (walk-ins, moved here, the paid
//     payment of a transferred booking), and what is left out
//   - admin_search_bookings: search by name, email, phone and booking code,
//     the status / date / time filters, expired holds hidden by default
//   - admin_get_booking: details, transfers and every payment
//   - admin_dashboard_summary: the Dashboard numbers
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Admin daily pages: dashboard, classes, rosters, search (migration 9)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, attempt, book, seatsLeft, sessionIn, confirmedBooking, users } = t;
  await t.addUser('A');
  await t.addUser('B');
  await t.addUser('admin', { admin: true });
  await t.addUser('admin2', { admin: true });
  // Give the clients real names and phones, so search has something to find.
  await q(`update public.profiles set full_name = 'Andrea Cruz', mobile = '+63 917 123 4567' where id = $1`, [users.A]);
  await q(`update public.profiles set full_name = 'Bianca Reyes', mobile = '0918 555 0000' where id = $1`, [users.B]);

  // The days of the test classes (Philippine dates), worked out by the database.
  const today = (await one(`select public.manila_today()::text as d`)).d;

  // Adds a paid payment to a booking. Gives back the payment id.
  const pay = async (bookingId, method = 'gcash', amount = 550) => (await one(`
    insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref)
    values ($1, 'paymongo', $2, $3, 'paid', now(), 'pay_' || gen_random_uuid())
    returning id`, [bookingId, method, amount])).id;

  // ---- Sample classes and bookings ------------------------------------------
  // A class that started 30 minutes ago (still running, so a walk-in can
  // still join): A confirmed (paid), B attended, and a walk-in.
  const past = await sessionIn(-0.5);
  const pastA = await confirmedBooking(past, 'A');
  await pay(pastA);
  const pastB = await confirmedBooking(past, 'B');
  await q(`update public.bookings set status = 'attended' where id = $1`, [pastB]);
  const walk = await as('admin', `select * from public.admin_walkin_booking($1, 'Walk-in Wena', '0917 777 8888', 'cash', true, true)`, [past]);
  const walkId = walk.row?.booking_id;

  // A class 2 days ahead (4 seats): B has a live hold, A had a hold that ran out.
  const S = await t.emptySessions(2);
  const future = S[0];
  const holdB = (await book('B', future)).row?.booking_id;
  const deadHoldA = (await book('A', future)).row?.booking_id;
  await q(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [deadHoldA]);

  // A transfer: A's booking 3 days ahead (paid) is moved to S[1].
  const moveFrom = await confirmedBooking(S[2], 'A');
  const movePay = await pay(moveFrom, 'card');
  const moved = (await as('A', 'select public.transfer_my_booking($1, $2) as id', [moveFrom, S[1]])).row?.id;

  // A booking waiting for a manual transfer check, and a late payment.
  const waiting = (await one(`
    insert into public.bookings (session_id, user_id, status, class_fee, total, not_pregnant_confirmed, agreed_at, hold_expires_at)
    values ($1, $2, 'awaiting_verification', 500, 500, true, now(), now() - interval '1 hour') returning id`, [S[3], users.B])).id;
  await q(`insert into public.payments (booking_id, provider, method, amount, screenshot_path) values ($1, 'manual', 'bpi', 500, 'x.png')`, [waiting]);
  const late = (await one(`
    insert into public.bookings (session_id, user_id, status, class_fee, total, not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'paid_needs_action', 500, 500, true, now()) returning id`, [S[4], users.A])).id;
  await pay(late, 'maya', 500);

  // ===========================================================================
  t.section('Only active admins');
  // ===========================================================================
  const calls = [
    ['admin_dashboard_summary', 'select * from public.admin_dashboard_summary()', []],
    ['admin_list_sessions', 'select * from public.admin_list_sessions(current_date, current_date + 7)', []],
    ['admin_class_rosters', 'select * from public.admin_class_rosters($1)', [[past]]],
    ['admin_search_bookings', 'select * from public.admin_search_bookings()', []],
    ['admin_get_booking', 'select * from public.admin_get_booking($1)', [pastA]],
  ];
  for (const [name, sql, params] of calls) {
    const asClient = await attempt('A', sql, params);
    const asGuest = await attempt('guest', sql, params);
    const asAdmin = await attempt('admin', sql, params);
    check(`${name}: client, guest, admin`, 'client refused ("Only admins"), guest refused, admin allowed',
      !asClient.ok && asClient.err.includes('Only admins') && !asGuest.ok && asAdmin.ok,
      `client: ${asClient.err ?? 'ALLOWED'} | guest: ${asGuest.err ?? 'ALLOWED'} | admin: ${asAdmin.ok ? 'ok' : asAdmin.err}`);
  }
  await q('update public.profiles set is_active = false where id = $1', [users.admin2]);
  const r = await attempt('admin2', 'select * from public.admin_search_bookings()');
  check('A deactivated admin searches bookings', 'refused', !r.ok && r.err.includes('Only admins'), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('admin_list_sessions');
  // ===========================================================================
  const list = async (from, to) =>
    (await attempt('admin', 'select * from public.admin_list_sessions($1::date, $2::date)', [from, to])).rows ?? [];
  const pastDate = (await one('select date::text as d from public.class_sessions where id = $1', [past])).d;
  const futureDate = (await one('select date::text as d from public.class_sessions where id = $1', [future])).d;
  let rows = await list(pastDate, futureDate);
  const pastRow = rows.find((x) => x.session_id === past);
  check('The class that started 30 minutes ago', 'listed (past classes too), started, 3 seats taken, 2 to mark (A + walk-in; B is attended)',
    pastRow && pastRow.has_started && pastRow.seats_taken === 3 && pastRow.to_mark === 2,
    pastRow && `started ${pastRow.has_started}, taken ${pastRow.seats_taken}, to mark ${pastRow.to_mark}`);
  const futureRow = rows.find((x) => x.session_id === future);
  check('The class 2 days ahead', 'seats_left = seats_left() (live hold counts, ended hold does not), nothing to mark',
    futureRow && futureRow.seats_left === (await seatsLeft(future)) && futureRow.seats_taken === 1 && futureRow.to_mark === 0 && !futureRow.has_started,
    futureRow && `left ${futureRow.seats_left} (seats_left says ${await seatsLeft(future)}), taken ${futureRow.seats_taken}, to mark ${futureRow.to_mark}`);

  await as('admin', 'select public.admin_cancel_session($1)', [past]);
  rows = await list(pastDate, pastDate);
  const cancelledRow = rows.find((x) => x.session_id === past);
  check('After the cafe cancels that class', 'still listed as cancelled, nothing to mark (clients get a free transfer)',
    cancelledRow?.status === 'cancelled' && cancelledRow.to_mark === 0, cancelledRow && `${cancelledRow.status}, to mark ${cancelledRow.to_mark}`);
  await q(`update public.class_sessions set status = 'open' where id = $1`, [past]);

  let bad = await attempt('admin', `select * from public.admin_list_sessions(current_date, current_date - 1)`);
  check('End date before start date', 'refused with a message', !bad.ok && bad.err.includes('end date'), bad.err ?? 'ALLOWED');
  const far = (await attempt('admin', `select count(*)::int as total, count(*) filter (where date > $1::date + 92)::int as too_far
    from public.admin_list_sessions($1::date, '2099-01-01')`, [today])).row;
  check('Asking for 70+ years', 'some classes, but none more than 92 days ahead',
    far?.total > 0 && far.too_far === 0, far && `${far.total} classes, ${far.too_far} too far`);

  // ===========================================================================
  t.section('admin_class_rosters');
  // ===========================================================================
  const roster = async (ids) => (await attempt('admin', 'select * from public.admin_class_rosters($1)', [ids])).rows ?? [];
  rows = await roster([past]);
  const names = rows.map((x) => x.guest_name);
  const walkRow = rows.find((x) => x.booking_id === walkId);
  const aRow = rows.find((x) => x.booking_id === pastA);
  check('The past class roster', 'Andrea, Bianca and the walk-in (3 rows)',
    rows.length === 3 && names.includes('Andrea Cruz') && names.includes('Bianca Reyes') && names.includes('Walk-in Wena'), names.join(', '));
  check('The walk-in row', 'is_walkin, its own contact number, paid 500.00 cash',
    walkRow?.is_walkin && walkRow.guest_contact === '0917 777 8888' && walkRow.paid_amount === '500.00' && walkRow.paid_method === 'cash',
    walkRow && `${walkRow.is_walkin}, ${walkRow.guest_contact}, ${walkRow.paid_amount} ${walkRow.paid_method}`);
  check("Andrea's row", 'her mobile and email, drink + mat, paid by GCash',
    aRow?.guest_contact === '+63 917 123 4567' && aRow.guest_email === 'a@test.example' && aRow.drink_choice === 'Iced Matcha' && aRow.mat_rental && aRow.paid_method === 'gcash',
    aRow && `${aRow.guest_contact}, ${aRow.guest_email}, ${aRow.drink_choice}, mat ${aRow.mat_rental}, ${aRow.paid_method}`);

  rows = await roster([future, S[1], S[2]]);
  const ids = rows.map((x) => x.booking_id);
  const movedRow = rows.find((x) => x.booking_id === moved);
  check('Several classes at once', "B's live hold and the moved booking; NOT the ended hold or the transferred-away one",
    ids.includes(holdB) && ids.includes(moved) && !ids.includes(deadHoldA) && !ids.includes(moveFrom), `${rows.length} rows`);
  check('The live hold', 'listed but marked as a seat holder that is not paid',
    rows.find((x) => x.booking_id === holdB)?.seat_holding === true && rows.find((x) => x.booking_id === holdB)?.paid_amount === null,
    JSON.stringify(rows.find((x) => x.booking_id === holdB)?.status));
  check('The moved booking', "moved_here, shows the ORIGINAL booking's card payment",
    movedRow?.moved_here && movedRow.paid_method === 'card', movedRow && `${movedRow.moved_here}, ${movedRow.paid_method}`);
  bad = await attempt('admin', 'select * from public.admin_class_rosters(array_fill(gen_random_uuid(), array[51]))');
  check('51 classes at once', 'refused', !bad.ok, bad.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('admin_search_bookings');
  // ===========================================================================
  const search = async (args) => {
    const res = await attempt('admin', `select * from public.admin_search_bookings(
      p_search => $1, p_statuses => $2, p_date => $3, p_start_time => $4, p_when => $5, p_limit => $6)`,
    [args.search ?? null, args.statuses ?? null, args.date ?? null, args.time ?? null, args.when ?? 'all', args.limit ?? 200]);
    if (!res.ok) throw new Error(res.err);
    return res.rows;
  };
  const has = (list_, id) => list_.some((x) => x.booking_id === id);

  rows = await search({ search: 'andrea' });
  check('Search "andrea" (lower case)', "only Andrea's bookings", rows.length > 0 && rows.every((x) => x.guest_name === 'Andrea Cruz'),
    rows.map((x) => x.guest_name).join(', '));
  rows = await search({ search: 'b@test.EXAMPLE' });
  check('Search by email (any case)', "Bianca's bookings", rows.length > 0 && rows.every((x) => x.guest_name === 'Bianca Reyes'), `${rows.length} rows`);
  rows = await search({ search: '0917 123 4567' });
  check('Search "0917 123 4567" (saved as +63 917 123 4567)', "finds Andrea's bookings",
    rows.length > 0 && rows.every((x) => x.guest_name === 'Andrea Cruz'), `${rows.length} rows`);
  rows = await search({ search: '7778888' });
  check('Search a walk-in phone (last digits)', 'finds the walk-in', rows.length === 1 && rows[0].booking_id === walkId, `${rows.length} rows`);
  const code = `B69-${pastA.slice(0, 8).toUpperCase()}`;
  rows = await search({ search: code });
  check(`Search the booking code ${code}`, 'exactly that booking', rows.length === 1 && rows[0].booking_id === pastA, `${rows.length} rows`);
  rows = await search({ search: '100%_' });
  check('Search with % and _ (special characters in LIKE)', 'no rows, no error', rows.length === 0, `${rows.length} rows`);

  rows = await search({});
  check('No filter', 'everything except the ended hold (shown as expired)', !has(rows, deadHoldA) && has(rows, holdB) && has(rows, walkId),
    `${rows.length} rows`);
  rows = await search({ statuses: ['expired'] });
  const deadRow = rows.find((x) => x.booking_id === deadHoldA);
  check('Status filter: expired', 'the ended hold, shown as "expired"', deadRow?.status === 'expired', deadRow?.status);
  rows = await search({ statuses: ['awaiting_verification', 'paid_needs_action'] });
  check('Status filter: needs action (2 statuses)', 'the manual transfer and the late payment',
    rows.length === 2 && has(rows, waiting) && has(rows, late), `${rows.length} rows`);
  rows = await search({ statuses: ['pending_payment'] });
  const holdRow = rows.find((x) => x.booking_id === holdB);
  check('Status filter: pending payment', "only B's live hold, with seconds left", rows.length === 1 && holdRow?.hold_seconds_left > 0,
    `${rows.length} rows, ${holdRow?.hold_seconds_left}s`);
  bad = await attempt('admin', `select * from public.admin_search_bookings(p_statuses => array['made_up'])`);
  check('A made-up status', 'refused', !bad.ok && bad.err.includes('Unknown'), bad.err ?? 'ALLOWED');

  rows = await search({ date: pastDate });
  check('Date filter (the past class day)', 'only bookings on that date', rows.length > 0 && rows.every((x) => String(x.class_date) === String(rows[0].class_date)) && has(rows, pastA),
    `${rows.length} rows`);
  const pastTime = (await one('select start_time::text as t from public.class_sessions where id = $1', [past])).t;
  rows = await search({ time: pastTime, when: 'all' });
  check('Class time filter', 'only classes starting at that time', rows.length > 0 && rows.every((x) => x.start_time === pastTime), `${rows.length} rows`);
  const up = await search({ when: 'upcoming' });
  const old = await search({ when: 'past' });
  const allRows = await search({ when: 'all' });
  check('upcoming + past = all', 'the two lists add up, no overlap',
    up.length + old.length === allRows.length && !up.some((x) => has(old, x.booking_id)), `${up.length} + ${old.length} vs ${allRows.length}`);
  rows = await search({ limit: 2 });
  check('Limit 2', '2 rows, total_matches = the full count', rows.length === 2 && rows[0].total_matches === allRows.length,
    `${rows.length} rows, total ${rows[0]?.total_matches}`);

  // ===========================================================================
  t.section('admin_get_booking');
  // ===========================================================================
  let d = (await attempt('admin', 'select * from public.admin_get_booking($1)', [moved])).row;
  check('The moved booking', 'moved from the old class, and its payment (on the original booking) is listed',
    d && d.moved_from_booking_id === moveFrom && d.moved_from_date !== null && Array.isArray(d.payments)
      && d.payments.length === 1 && d.payments[0].id === movePay && d.payments[0].booking_id === moveFrom,
    d && `from ${d.moved_from_booking_id === moveFrom ? 'old booking' : d.moved_from_booking_id}, ${d.payments?.length} payment(s)`);
  d = (await attempt('admin', 'select * from public.admin_get_booking($1)', [moveFrom])).row;
  check('The old booking', 'transferred, moved TO the new booking', d?.status === 'transferred' && d.moved_to_booking_id === moved,
    d && `${d.status}, to ${d.moved_to_booking_id === moved ? 'new booking' : d.moved_to_booking_id}`);
  d = (await attempt('admin', 'select * from public.admin_get_booking($1)', [walkId])).row;
  check('The walk-in', 'is_walkin, cash payment verified by the admin (by name), can mark attendance',
    d?.is_walkin && d.guest_name === 'Walk-in Wena' && d.payments[0].provider === 'cash' && d.payments[0].verified_by_name === 'Test admin' && d.can_mark_attendance,
    d && `${d.is_walkin}, ${d.payments[0]?.provider}, by ${d.payments[0]?.verified_by_name}, mark ${d.can_mark_attendance}`);
  d = (await attempt('admin', 'select * from public.admin_get_booking($1)', [waiting])).row;
  check('The manual transfer', 'pending BPI payment with a screenshot, no attendance yet',
    d?.payments[0].status === 'pending' && d.payments[0].has_screenshot === true && !d.can_mark_attendance,
    d && `${d.payments[0]?.status}, screenshot ${d.payments[0]?.has_screenshot}, mark ${d.can_mark_attendance}`);
  d = (await attempt('admin', 'select * from public.admin_get_booking($1)', [deadHoldA])).row;
  check('The ended hold', 'saved status pending_payment, shown as expired', d?.status === 'pending_payment' && d.shown_status === 'expired',
    d && `${d.status} -> ${d.shown_status}`);
  rows = (await attempt('admin', 'select * from public.admin_get_booking(gen_random_uuid())')).rows;
  check('A booking id that does not exist', 'no rows', rows?.length === 0, `${rows?.length} rows`);

  // ===========================================================================
  t.section('admin_dashboard_summary');
  // ===========================================================================
  // A class later today with 1 of 2 seats taken, so "today" has known numbers.
  const todayClass = await one(`
    insert into public.class_sessions (date, start_time, end_time, capacity)
    values (public.manila_today(), '23:58', '23:59', 2) returning id`);
  await confirmedBooking(todayClass.id, 'B');
  const expected = await one(`
    select count(*)::int as classes, sum(capacity)::int as capacity, sum(public.seats_taken(id))::int as taken
    from public.class_sessions where date = public.manila_today() and status <> 'cancelled'`);
  const s = (await attempt('admin', 'select * from public.admin_dashboard_summary()')).row;
  check("Today's classes and seats", `${expected.classes} classes, ${expected.taken} of ${expected.capacity} seats`,
    s && s.today_classes === expected.classes && s.today_capacity === expected.capacity && s.today_taken === expected.taken && String(s.today) !== '',
    s && `${s.today_classes} classes, ${s.today_taken} of ${s.today_capacity}`);
  check('Needs action counts', '1 awaiting verification, 1 paid needs action, 1 live hold',
    s?.awaiting_verification === 1 && s.paid_needs_action === 1 && s.live_holds === 1,
    s && `${s.awaiting_verification}, ${s.paid_needs_action}, ${s.live_holds}`);
  check('Attendance to mark', '2 bookings in 1 class (the class that started 30 minutes ago)', s?.to_mark === 2 && s.to_mark_classes === 1,
    s && `${s.to_mark} in ${s.to_mark_classes}`);
  // Paid today: 550 (A) + 500 (walk-in cash) + 550 (card) + 500 (late Maya) = 2100; mats: 50 + 0 + 50 + 0 = 100
  check('Money paid this week and month (all paid today)', 'week 2100.00, month 2100.00, mats 100.00',
    s?.paid_this_week === '2100.00' && s.paid_this_month === '2100.00' && s.mats_this_month === '100.00',
    s && `${s.paid_this_week}, ${s.paid_this_month}, ${s.mats_this_month}`);
}
