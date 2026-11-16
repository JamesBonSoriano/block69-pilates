// Tests for migration 27 (..._v17_appointments.sql), Version 1.7 Prompt D.
//   - Appointments list: "All" shows every status (ended holds too), never a
//     re-scheduled OLD row (no duplicates), and "All dates" lists today and
//     later first, then past classes
//   - admin_cancel_appointment(): the 3 choices (free 100% code, normal
//     policy at 72h / 18h / 6h, refunded outside the website), the seat is
//     freed, ONE bell update, the log row, the payment and Earnings, the
//     required reason, walk-ins, and who may call it
//   - get_my_cafe_cancellations(): each client sees only their own
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.7: Appointments list, admin cancel with 3 choices';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, q, as, attempt, sessionIn } = t;
  for (const key of ['A', 'B', 'C', 'D', 'E']) await t.addUser(key);
  await t.addUser('admin', { admin: true });

  // A confirmed + paid (cash, 550 pesos) booking for one client in one class.
  // Takes: the class id and the user key. Gives back: { id, payId }.
  async function paidBooking(sessionId, key) {
    const id = await t.confirmedBooking(sessionId, key);
    const payId = await t.pay(id, 550);
    return { id, payId };
  }
  // The admin's Appointments list (all statuses unless given).
  async function list(args = {}) {
    const r = await attempt('admin', `select * from public.admin_search_bookings(
      p_statuses => $1, p_when => $2, p_limit => 500)`, [args.statuses ?? null, args.when ?? 'all']);
    if (!r.ok) throw new Error(r.err);
    return r.rows;
  }
  const ids = (rows) => rows.map((row) => row.booking_id);
  // The admin cancels with a choice and a reason (kept).
  const cancel = (bookingId, choice, reason = 'Instructor is sick') =>
    as('admin', `select * from public.admin_cancel_appointment($1, $2, $3)`, [bookingId, choice, reason]);
  // A booking's bell updates, leaving out the "booking confirmed" one that
  // the test's own setup insert makes.
  const bell = (bookingId) => q(`select kind, voucher_code from public.notifications
    where booking_id = $1 and kind <> 'booking_confirmed'`, [bookingId]);
  // The newest admin log row for a booking.
  const logRow = (bookingId) => one(`select action, overridden, note, normal_rule, voucher_id from public.booking_admin_actions
    where booking_id = $1 order by created_at desc limit 1`, [bookingId]);

  // ===========================================================================
  t.section('Appointments list');
  // ===========================================================================
  const listClass = await sessionIn(96);
  const otherClass = await sessionIn(120);
  // An ended unpaid hold (shown as "expired")
  let r = await t.book('C', listClass);
  const deadHold = r.row?.booking_id;
  await t.db.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [deadHold]);
  // A paid booking that the admin re-schedules to another class
  const moved = await paidBooking(listClass, 'D');
  r = await as('admin', `select public.admin_reschedule_booking($1, $2, 'Client asked') as id`, [moved.id, otherClass]);
  const movedNew = r.row?.id;
  check('Re-schedule for the list test', 'done', r.ok && Boolean(movedNew), r.err);
  // A past class with a booking (for the order)
  const pastClass = await sessionIn(-48);
  const pastBooking = await t.confirmedBooking(pastClass, 'E');

  let rows = await list();
  check('"All": an ended unpaid hold', 'listed (shown as expired)', rows.some((x) => x.booking_id === deadHold && x.status === 'expired'),
    `${rows.length} rows`);
  check('"All": the re-scheduled OLD booking', 'not listed', !ids(rows).includes(moved.id), 'listed');
  check('"All": the NEW booking', 'listed as confirmed', rows.some((x) => x.booking_id === movedNew && x.status === 'confirmed'), 'missing');
  check('No duplicates', 'every booking once', new Set(ids(rows)).size === rows.length, `${rows.length} rows`);
  rows = await list({ statuses: ['transferred'] });
  check('Asking for "transferred" on purpose', 'nothing (old rows are never listed)', rows.length === 0, `${rows.length} rows`);
  rows = await list();
  const firstPast = rows.findIndex((x) => x.class_date < rows[0].class_date || x.booking_id === pastBooking);
  const lastUpcoming = rows.map((x) => x.booking_id).lastIndexOf(movedNew);
  check('"All dates" order', 'today and later first, then past classes', firstPast > lastUpcoming && ids(rows).includes(pastBooking),
    `past at ${firstPast}, upcoming at ${lastUpcoming}`);
  check('The old row is still in the database', 'status transferred', (await t.status(moved.id)) === 'transferred', await t.status(moved.id));

  // ===========================================================================
  t.section('Cancel: free re-schedule (100% code)');
  // ===========================================================================
  // (Every class here gets its own hour, so no two share a date + time)
  const cls72 = await sessionIn(72);
  const a = await paidBooking(cls72, 'A');
  const seatsBefore = await t.seatsLeft(cls72);
  r = await cancel(a.id, 'free');
  check('Free re-schedule', 'cancelled_with_voucher, outcome free_code, a FREE- code',
    r.ok && r.row?.new_status === 'cancelled_with_voucher' && r.row.outcome === 'free_code' && /^FREE-[0-9A-F]{6}$/.test(r.row.voucher_code ?? ''),
    r.err ?? JSON.stringify(r.row));
  const freeCode = r.row?.voucher_code;
  const v = await one(`select percent_off::int as pct, owner_id, uses_left, source,
    round(extract(epoch from expires_at - now()) / 86400) as days from public.vouchers where code = $1`, [freeCode]);
  check('The code', '100% of the class fee, client A, one use, 60 days', v?.pct === 100 && v.owner_id === t.users.A && v.uses_left === 1 && Number(v.days) === 60,
    JSON.stringify(v));
  check('The seat', 'freed', (await t.seatsLeft(cls72)) === seatsBefore + 1, `${seatsBefore} -> ${await t.seatsLeft(cls72)}`);
  let updates = await bell(a.id);
  check('Bell updates', 'exactly ONE: cafe_cancelled_free_code with the code',
    updates.length === 1 && updates[0].kind === 'cafe_cancelled_free_code' && updates[0].voucher_code === freeCode, JSON.stringify(updates));
  let log = await logRow(a.id);
  check('Admin log', 'cancel_free_code, override, the reason saved', log?.action === 'cancel_free_code' && log.overridden && log.note === 'Instructor is sick',
    JSON.stringify(log));
  check('The payment', 'still paid (counted in Earnings)', (await one(`select status from public.payments where id = $1`, [a.payId])).status === 'paid', 'changed');

  // ===========================================================================
  t.section('Cancel: normal policy');
  // ===========================================================================
  const b72 = await paidBooking(await sessionIn(73), 'B');
  r = await cancel(b72.id, 'policy');
  check('Policy, more than 24h away', '100% code (the client could move for free)', r.ok && r.row?.outcome === 'free_code', r.err ?? r.row?.outcome);
  log = await logRow(b72.id);
  check('Its log', 'cancel_free_code, NOT an override (normal rule)', log?.action === 'cancel_free_code' && !log.overridden, JSON.stringify(log));

  const b18 = await paidBooking(await sessionIn(18), 'B');
  r = await cancel(b18.id, 'policy');
  check('Policy, 18 hours away', '50% HALF- code, cancelled_with_voucher',
    r.ok && r.row?.outcome === 'half_code' && r.row.new_status === 'cancelled_with_voucher' && /^HALF-/.test(r.row.voucher_code ?? ''), r.err ?? JSON.stringify(r.row));
  const half = await one(`select percent_off::int as pct from public.vouchers where code = $1`, [r.row?.voucher_code]);
  check('The 50% code', '50%', half?.pct === 50, JSON.stringify(half));
  updates = await bell(b18.id);
  check('Its bell update', 'one: cafe_cancelled_half_code', updates.length === 1 && updates[0].kind === 'cafe_cancelled_half_code', JSON.stringify(updates));

  const b6 = await paidBooking(await sessionIn(6), 'B');
  r = await cancel(b6.id, 'policy');
  check('Policy, 6 hours away', 'no credit: forfeited, no code', r.ok && r.row?.outcome === 'no_credit' && r.row.new_status === 'forfeited' && !r.row.voucher_code,
    r.err ?? JSON.stringify(r.row));
  updates = await bell(b6.id);
  check('Its bell update', 'one: cafe_cancelled_no_credit', updates.length === 1 && updates[0].kind === 'cafe_cancelled_no_credit', JSON.stringify(updates));

  // ===========================================================================
  t.section('Cancel: refunded outside the website');
  // ===========================================================================
  // Money paid today in Earnings (admin_billing_summary checks the admin,
  // so it runs as the admin)
  const paidToday = async () => Number((await attempt('admin', 'select paid_today from public.admin_billing_summary()')).row.paid_today);
  const c = await paidBooking(await sessionIn(74), 'C');
  const before = await paidToday();
  r = await cancel(c.id, 'refunded', 'Paid back by GCash');
  check('Refunded', 'forfeited, no code, 550 pesos marked refunded',
    r.ok && r.row?.outcome === 'refunded' && r.row.new_status === 'forfeited' && !r.row.voucher_code && Number(r.row.refunded_amount) === 550,
    r.err ?? JSON.stringify(r.row));
  check('The payment', 'refunded', (await one(`select status from public.payments where id = $1`, [c.payId])).status === 'refunded', 'not refunded');
  const after = await paidToday();
  check('Earnings (paid today)', 'down by 550', before - after === 550, `${before} -> ${after}`);
  updates = await bell(c.id);
  check('Its bell update', 'one: cafe_cancelled_refunded', updates.length === 1 && updates[0].kind === 'cafe_cancelled_refunded', JSON.stringify(updates));
  log = await logRow(c.id);
  check('Its log', 'cancel_refunded, override, reason saved', log?.action === 'cancel_refunded' && log.overridden && log.note === 'Paid back by GCash',
    JSON.stringify(log));

  // After a re-schedule the payment sits on the ORIGINAL booking
  r = await cancel(movedNew, 'refunded');
  check('Refund a re-scheduled booking', 'done', r.ok && Number(r.row?.refunded_amount) === 550, r.err ?? JSON.stringify(r.row));
  check('The original booking\'s payment', 'refunded', (await one(`select status from public.payments where id = $1`, [moved.payId])).status === 'refunded',
    'not refunded');

  // ===========================================================================
  t.section('Cancel: rules and safety');
  // ===========================================================================
  const e = await paidBooking(await sessionIn(75), 'E');
  r = await attempt('admin', `select * from public.admin_cancel_appointment($1, 'free', '   ')`, [e.id]);
  check('No reason', 'refused', !r.ok && /reason/.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('admin', `select * from public.admin_cancel_appointment($1, 'half', 'x')`, [e.id]);
  check('A made-up choice', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('E', `select * from public.admin_cancel_appointment($1, 'free', 'x')`, [e.id]);
  check('A client calls it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('guest', `select * from public.admin_cancel_appointment($1, 'free', 'x')`, [e.id]);
  check('A guest calls it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('admin', `select * from public.admin_cancel_appointment($1, 'free', 'again')`, [a.id]);
  check('Cancel an already cancelled booking', 'refused', !r.ok && /Only confirmed/.test(r.err), r.err ?? 'ALLOWED');

  const walkClass = await sessionIn(76);
  const walkIn = (await one(`
    insert into public.bookings (session_id, walkin_name, walkin_contact, status, class_fee, total, not_pregnant_confirmed, agreed_at)
    values ($1, 'Walk In', '09170000000', 'confirmed', 500, 500, true, now()) returning id`, [walkClass])).id;
  r = await attempt('admin', `select * from public.admin_cancel_appointment($1, 'free', 'x')`, [walkIn]);
  check('Walk-in, free re-schedule', 'refused (no account for a code)', !r.ok && /Walk-ins/.test(r.err), r.err ?? 'ALLOWED');
  r = await cancel(walkIn, 'refunded');
  check('Walk-in, refunded', 'allowed, no bell update', r.ok && (await bell(walkIn)).length === 0, r.err);

  // The normal client cancel still gets the usual (automatic) bell update
  const own = await paidBooking(await sessionIn(19), 'E');
  r = await as('E', 'select * from public.cancel_my_booking($1)', [own.id]);
  updates = await bell(own.id);
  check('A client cancels their own booking (18h)', 'the usual cancelled_with_voucher update (the skip switch is off again)',
    r.ok && updates.length === 1 && updates[0].kind === 'cancelled_with_voucher', r.err ?? JSON.stringify(updates));

  // ===========================================================================
  t.section('My Bookings: get_my_cafe_cancellations()');
  // ===========================================================================
  r = await as('A', 'select * from public.get_my_cafe_cancellations()');
  check('Client A', 'only their own: the free_code cancel with its code',
    r.ok && r.rows.length === 1 && r.rows[0].booking_id === a.id && r.rows[0].outcome === 'free_code' && r.rows[0].voucher_code === freeCode,
    r.err ?? JSON.stringify(r.rows));
  r = await as('C', 'select * from public.get_my_cafe_cancellations()');
  check('Client C', 'their refunded cancel', r.ok && r.rows.some((x) => x.booking_id === c.id && x.outcome === 'refunded'), r.err ?? JSON.stringify(r.rows));
  check('No admin reason for clients', 'not in the columns', r.ok && !('note' in (r.rows[0] ?? {})), 'note visible');
  r = await attempt('guest', 'select * from public.get_my_cafe_cancellations()');
  check('A guest', 'refused', !r.ok, r.err ?? 'ALLOWED');
}
