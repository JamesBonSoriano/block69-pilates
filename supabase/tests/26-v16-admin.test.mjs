// Tests for migration 24 (..._v16_admin.sql), Version 1.6 admin Appointments.
//   - admin_reschedule_booking: an admin moves a confirmed booking to another
//     open class (free, reason required). The old booking is 'transferred',
//     the new one 'confirmed' with the same amounts, seats move, the client
//     gets "Booking moved" in the bell, and the reason is logged.
//     Refused: a client calling it, no reason, a full class, a class that
//     started, a closed class, the same class, unpaid / being-checked
//     bookings, a booking already moved. A late payment in a class the cafe
//     cancelled can be moved only when the money covers the total.
//   - admin_reject_payment: a reason is required, clients can't call it, the
//     screenshot is rejected (seat freed) and the reason is logged.
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.6: admin re-schedule and reject payment with a reason';

// The database's message for a non-admin (require_admin, migration 3).
const ADMINS_ONLY = /Only admins/;

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, attempt, sessionIn } = t;
  for (const key of ['A', 'B', 'C', 'D', 'E', 'F']) await t.addUser(key);
  await t.addUser('admin', { admin: true });

  // The admin re-schedules (kept), or tries to (undone), as someone.
  const reschedule = (actor, bookingId, sessionId, reason) =>
    as(actor, `select public.admin_reschedule_booking($1, $2, $3) as id`, [bookingId, sessionId, reason]);
  const tryReschedule = (actor, bookingId, sessionId, reason = 'Client asked by message') =>
    attempt(actor, `select public.admin_reschedule_booking($1, $2, $3) as id`, [bookingId, sessionId, reason]);

  // A paid, confirmed booking for a user in a class.
  async function paidBooking(sessionId, userKey) {
    const id = await t.confirmedBooking(sessionId, userKey);
    await t.pay(id);
    return id;
  }

  const fromCls = await sessionIn(72);      // the booking's class, in 3 days
  const toCls = await sessionIn(96);        // an open class in 4 days
  const fullCls = await sessionIn(120, 1);  // 1 seat, taken below
  const startedCls = await sessionIn(-0.25); // started 15 minutes ago
  const closedCls = await sessionIn(144);
  await t.db.query(`update public.class_sessions set status = 'closed' where id = $1`, [closedCls]);
  await paidBooking(fullCls, 'F');

  const bookingA = await paidBooking(fromCls, 'A');

  // ===========================================================================
  t.section('Re-schedule: who and why');
  // ===========================================================================
  let r = await tryReschedule('A', bookingA, toCls);
  check('A client calls admin_reschedule_booking (even for their own booking)', 'refused: admins only',
    !r.ok && ADMINS_ONLY.test(r.err), r.err ?? 'ALLOWED');
  r = await tryReschedule('guest', bookingA, toCls);
  check('A guest calls it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await tryReschedule('admin', bookingA, toCls, '   ');
  check('Admin re-schedules with no reason', 'refused: a reason is needed', !r.ok && /reason/.test(r.err), r.err ?? 'ALLOWED');
  r = await tryReschedule('admin', bookingA, toCls, 'x'.repeat(501));
  check('Admin writes a 501-character reason', 'refused', !r.ok && /500 characters/.test(r.err), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Re-schedule: the new class must take people');
  // ===========================================================================
  r = await tryReschedule('admin', bookingA, fullCls);
  check('Into a full class', 'refused (no overbooking)', !r.ok && /full/.test(r.err), r.err ?? 'ALLOWED');
  r = await tryReschedule('admin', bookingA, startedCls);
  check('Into a class that already started', 'refused (booking closed)', !r.ok && /closed/.test(r.err), r.err ?? 'ALLOWED');
  r = await tryReschedule('admin', bookingA, closedCls);
  check('Into a class the admin closed', 'refused (not open)', !r.ok && /not open/.test(r.err), r.err ?? 'ALLOWED');
  r = await tryReschedule('admin', bookingA, fromCls);
  check('Into the same class', 'refused', !r.ok && /different class/.test(r.err), r.err ?? 'ALLOWED');
  r = await tryReschedule('admin', bookingA, '00000000-0000-0000-0000-000000000000');
  check('Into a class that does not exist', 'refused', !r.ok, r.err ?? 'ALLOWED');
  // Before the 8:00 AM cutoff: a class 3 days ahead with the cutoff moved to
  // after its start would be closed. Here: set the cutoff to midnight, so
  // every class TODAY is past it, and use a class later today.
  const laterToday = await t.sessionToday();
  await t.db.query(`update public.settings set value = '"00:00"' where key = 'cutoff_time'`);
  r = await tryReschedule('admin', bookingA, laterToday);
  check('Into a class later today, after the cutoff', 'refused (booking closed)', !r.ok && /closed/.test(r.err), r.err ?? 'ALLOWED');
  await t.db.query(`update public.settings set value = '"08:00"' where key = 'cutoff_time'`);
  // The client already has a seat in the class picked
  const otherB = await paidBooking(toCls, 'B');
  const bookingB2 = await paidBooking(fromCls, 'B');
  r = await tryReschedule('admin', bookingB2, toCls);
  check('Client already booked in the class picked', 'refused', !r.ok && /already has a booking/.test(r.err), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Re-schedule: it works');
  // ===========================================================================
  const seatsFromBefore = await t.seatsLeft(fromCls);
  const seatsToBefore = await t.seatsLeft(toCls);
  r = await reschedule('admin', bookingA, toCls, 'Instructor asked to move the group');
  const newA = r.row?.id;
  check('Admin re-schedules a confirmed booking with a reason', 'allowed, gives the new booking id', r.ok && Boolean(newA), r.err);
  check('The old booking', "'transferred'", (await t.status(bookingA)) === 'transferred', await t.status(bookingA));
  const moved = await one(`select * from public.bookings where id = $1`, [newA]);
  check('The new booking', "'confirmed' in the new class, same amounts, points back to the old one",
    moved?.status === 'confirmed' && moved?.session_id === toCls && moved?.transferred_from === bookingA &&
      Number(moved?.total) === 550 && moved?.mat_rental === true && moved?.drink_choice === 'Iced Matcha',
    JSON.stringify(moved && [moved.status, moved.session_id === toCls, moved.transferred_from === bookingA, moved.total]));
  check('Seats', 'one more free in the old class, one fewer in the new one',
    (await t.seatsLeft(fromCls)) === seatsFromBefore + 1 && (await t.seatsLeft(toCls)) === seatsToBefore - 1,
    `${await t.seatsLeft(fromCls)} / ${await t.seatsLeft(toCls)}`);
  const note = await one(`select n.kind from public.notifications n where n.user_id = $1 and n.booking_id = $2`, [t.users.A, newA]);
  check("The client's bell", "'booking_transferred' (Booking moved) on the new booking", note?.kind === 'booking_transferred', note?.kind);
  const log = await one(`select * from public.booking_admin_actions where booking_id = $1`, [bookingA]);
  check('The admin log', "action 'reschedule', the new booking, the reason, the admin",
    log?.action === 'reschedule' && log?.new_booking_id === newA && log?.note === 'Instructor asked to move the group' &&
      log?.admin_id === t.users.admin && log?.overridden === false,
    JSON.stringify(log && [log.action, log.note, log.overridden]));
  // (admin_booking_change_info needs an admin: read it as the admin)
  r = await as('admin', `select actions from public.admin_booking_change_info($1)`, [newA]);
  check('Booking details History (admin_booking_change_info)', 'lists the re-schedule with its reason',
    r.ok && r.row?.actions?.some((a) => a.action === 'reschedule' && a.note === 'Instructor asked to move the group'), r.err);
  r = await attempt('A', `select count(*)::int as n from public.booking_admin_actions`);
  check('The client reads booking_admin_actions', 'sees nothing (admins only)', r.ok ? r.row.n === 0 : true, r.ok ? r.row.n : r.err);

  r = await tryReschedule('admin', bookingA, fullCls);
  check('Re-schedule the OLD (transferred) booking again', 'refused', !r.ok && /Only confirmed/.test(r.err), r.err ?? 'ALLOWED');
  // The new booking can be moved again by the admin (no once-only rule)
  const toCls2 = await sessionIn(168);
  r = await tryReschedule('admin', newA, toCls2);
  check('Re-schedule the new booking again', 'allowed (admin decision, reason given)', r.ok, r.err);
  check('(B is still in the other class)', 'untouched', (await t.status(otherB)) === 'confirmed', await t.status(otherB));

  // ===========================================================================
  t.section('Re-schedule: which bookings');
  // ===========================================================================
  // C: an unpaid hold (pending payment)
  r = await t.book('C', fromCls);
  const holdC = r.row?.booking_id;
  r = await tryReschedule('admin', holdC, toCls2);
  check('Unpaid hold (pending payment)', 'refused', !r.ok && /Only confirmed/.test(r.err), r.err ?? 'ALLOWED');
  // D: a screenshot being checked
  const waitD = (await one(`
    insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                                 not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'awaiting_verification', false, 'Iced Matcha', 500, 0, 500, true, now()) returning id`,
  [fromCls, t.users.D])).id;
  const payD = (await one(`
    insert into public.payments (booking_id, provider, method, amount, status, screenshot_path)
    values ($1, 'manual', 'gcash', 500, 'pending', 'test/d.png') returning id`, [waitD])).id;
  r = await tryReschedule('admin', waitD, toCls2);
  check('Payment still being checked', 'refused (approve it first)', !r.ok && /Only confirmed/.test(r.err), r.err ?? 'ALLOWED');

  // E: late payments in a class the cafe cancelled
  const cancelledCls = await sessionIn(80);
  const lateE = (await one(`
    insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                                 not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'paid_needs_action', false, 'Iced Matcha', 500, 0, 500, true, now()) returning id`,
  [cancelledCls, t.users.E])).id;
  await t.pay(lateE, 300); // only 300 of 500 came in
  await as('admin', `select public.admin_cancel_session($1)`, [cancelledCls]);
  r = await tryReschedule('admin', lateE, toCls2);
  check('Late payment in a cancelled class, paid 300 of 500', 'refused (money does not cover it)',
    !r.ok && /doesn't cover/.test(r.err), r.err ?? 'ALLOWED');
  await t.pay(lateE, 200); // the rest came in
  r = await tryReschedule('admin', lateE, toCls2);
  check('Late payment in a cancelled class, paid in full', 'allowed', r.ok, r.err);
  // A late payment in a class that is NOT cancelled: clients move those themselves
  const lateOpen = (await one(`
    insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                                 not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'paid_needs_action', false, 'Iced Matcha', 500, 0, 500, true, now()) returning id`,
  [fromCls, t.users.E])).id;
  await t.pay(lateOpen, 500);
  r = await tryReschedule('admin', lateOpen, toCls2);
  check('Late payment in a class that is still on', 'refused', !r.ok && /Only confirmed/.test(r.err), r.err ?? 'ALLOWED');
  // A confirmed booking in a class the cafe cancelled (the usual case)
  const inCancelled = await paidBooking(cancelledCls, 'F');
  r = await tryReschedule('admin', inCancelled, toCls2);
  check('Confirmed booking in a cancelled class', 'allowed', r.ok, r.err);
  // A walk-in (no account): allowed, nobody to notify
  const walkin = (await one(`
    insert into public.bookings (session_id, walkin_name, walkin_contact, status, mat_rental,
                                 class_fee, mat_fee, total, not_pregnant_confirmed, agreed_at)
    values ($1, 'Walk In', '09171234567', 'confirmed', false, 500, 0, 500, true, now()) returning id`, [fromCls])).id;
  r = await tryReschedule('admin', walkin, toCls2);
  check('Walk-in booking', 'allowed', r.ok, r.err);

  // ===========================================================================
  t.section('Reject payment with a reason');
  // ===========================================================================
  r = await attempt('D', `select public.admin_reject_payment($1, 'nope')`, [payD]);
  check('A client calls admin_reject_payment', 'refused: admins only', !r.ok && ADMINS_ONLY.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('admin', `select public.admin_reject_payment($1, '  ')`, [payD]);
  check('Admin rejects with no reason', 'refused: a reason is needed', !r.ok && /why/.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('admin', `select public.admin_reject_payment(gen_random_uuid(), 'Wrong amount')`);
  check('Admin rejects a payment that does not exist', 'refused', !r.ok && /couldn't find/.test(r.err), r.err ?? 'ALLOWED');
  const seatsBefore = await t.seatsLeft(fromCls);
  r = await as('admin', `select public.admin_reject_payment($1, 'Amount did not arrive in GCash') as s`, [payD]);
  check('Admin rejects with a reason', "allowed, booking 'expired'", r.ok && r.row?.s === 'expired', r.err ?? r.row?.s);
  const pay = await one(`select status, verified_by from public.payments where id = $1`, [payD]);
  check('The payment', "'rejected', by the admin", pay?.status === 'rejected' && pay?.verified_by === t.users.admin, pay?.status);
  check('The seat', 'free again', (await t.seatsLeft(fromCls)) === seatsBefore + 1, await t.seatsLeft(fromCls));
  const rejectLog = await one(`select * from public.booking_admin_actions where booking_id = $1`, [waitD]);
  check('The admin log', "action 'reject_payment' with the reason",
    rejectLog?.action === 'reject_payment' && rejectLog?.note === 'Amount did not arrive in GCash', JSON.stringify(rejectLog && [rejectLog.action, rejectLog.note]));
  const bell = await one(`select kind from public.notifications where user_id = $1 and booking_id = $2 order by created_at desc limit 1`,
    [t.users.D, waitD]);
  check("The client's bell", "'payment_rejected'", bell?.kind === 'payment_rejected', bell?.kind);
  r = await attempt('admin', `select public.admin_reject_payment($1, 'Again')`, [payD]);
  check('Reject the same payment twice', 'refused (already reviewed), nothing logged',
    !r.ok && /already reviewed/.test(r.err), r.err ?? 'ALLOWED');
  const logCount = await one(`select count(*)::int as n from public.booking_admin_actions where booking_id = $1`, [waitD]);
  check('(log rows for that booking)', 'still 1', logCount.n === 1, logCount.n);
}
