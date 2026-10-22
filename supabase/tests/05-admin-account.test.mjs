// Tests for the admin tools (walk-in booking, attendance, manual payment
// review, cancelling a class) and for deactivating an account (migration 3).
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Admin tools and account deactivation';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, book, seatsLeft, status, sessionIn, confirmedBooking } = t;
  for (const key of ['A', 'C', 'D', 'E', 'F']) await t.addUser(key);
  const admin = await t.addUser('admin', { admin: true });
  const S = await t.emptySessions(3);

  // ===========================================================================
  t.section('Only admins can use admin functions');
  // ===========================================================================
  const someBooking = await confirmedBooking(S[0], 'A');
  const adminCalls = [
    ['admin_walkin_booking', `select * from public.admin_walkin_booking($1, 'Walk-in Bea', '0917', 'cash', true, true)`, [S[0]]],
    ['admin_set_attendance', `select public.admin_set_attendance($1, 'attended')`, [someBooking]],
    ['admin_cancel_session', 'select public.admin_cancel_session($1)', [S[1]]],
    ['admin_review_manual_payment', 'select public.admin_review_manual_payment(gen_random_uuid(), true)', []],
  ];
  for (const [name, sql, params] of adminCalls) {
    const asClient = await t.attempt('A', sql, params);
    const asGuest = await t.attempt('guest', sql, params);
    check(`Client and guest call ${name}`, 'both refused', !asClient.ok && !asGuest.ok, `client: ${asClient.err} | guest: ${asGuest.err}`);
  }

  // ===========================================================================
  t.section('Walk-in booking');
  // ===========================================================================
  const one_seat = await sessionIn(3 * 24, 1);
  let r = await as('admin', `select * from public.admin_walkin_booking($1, 'Walk-in Bea', '0917 000 0000', 'cash', true, true, p_mat_rental => true)`, [one_seat]);
  const pay = r.ok ? await one('select provider, method, status, amount, verified_by from public.payments where id = $1', [r.row.payment_id]) : null;
  check('Walk-in takes the last seat, paid in cash', 'confirmed + paid 550.00 cash, recorded by the admin, 0 seats left',
    r.ok && (await status(r.row.booking_id)) === 'confirmed' && pay.status === 'paid' && pay.method === 'cash'
      && pay.amount === '550.00' && pay.verified_by === admin && (await seatsLeft(one_seat)) === 0,
    r.ok ? `${await status(r.row.booking_id)} + ${pay.status} ${pay.amount} ${pay.method}, seats left ${await seatsLeft(one_seat)}` : r.err);
  r = await as('admin', `select * from public.admin_walkin_booking($1, 'Walk-in Cy', '0917', 'gcash', true, true)`, [one_seat]);
  check('Walk-in into a full class', 'refused', !r.ok && r.err.includes('full'), r.err);
  r = await book('C', one_seat);
  check('Online booking after a walk-in took the last seat', 'refused', !r.ok && r.err.includes('full'), r.err);
  r = await as('admin', `select * from public.admin_walkin_booking($1, 'Walk-in Di', '0917', 'maya', true, true)`, [S[2]]);
  check('Walk-in paid with Maya', 'refused (cash, GCash or BPI only)', !r.ok, r.err);

  // ===========================================================================
  t.section('Attendance');
  // ===========================================================================
  const yesterday = await confirmedBooking(await sessionIn(-24), 'C');
  r = await as('admin', "select public.admin_set_attendance($1, 'no_show') as s", [yesterday]);
  check("Mark yesterday's booking as no-show", 'no_show', r.ok && (await status(yesterday)) === 'no_show', r.ok ? await status(yesterday) : r.err);
  r = await as('admin', "select public.admin_set_attendance($1, 'attended') as s", [yesterday]);
  check('Fix a mistake: change no-show to attended', 'attended', r.ok && (await status(yesterday)) === 'attended', r.ok ? await status(yesterday) : r.err);
  r = await as('admin', "select public.admin_set_attendance($1, 'attended') as s", [someBooking]);
  check('Mark a future booking attended', 'refused', !r.ok, r.err);

  // "attended" still takes a seat: a 1-seat class that started 30 minutes ago.
  const now_class = await sessionIn(-0.5, 1);
  const here = await confirmedBooking(now_class, 'D');
  await as('admin', "select public.admin_set_attendance($1, 'attended')", [here]);
  r = await as('admin', `select * from public.admin_walkin_booking($1, 'Late Walk-in', '0917', 'cash', true, true)`, [now_class]);
  check('Walk-in after the only guest was marked attended', 'refused (attended still holds the seat)', !r.ok && r.err.includes('full'), r.err);

  // ===========================================================================
  t.section('Manual transfer review (GCash / BPI screenshot)');
  // ===========================================================================
  // Makes a booking waiting for the admin to check its screenshot, plus its payment.
  const makeManual = async (userKey, sessionId) => {
    const b = (await one(`
      insert into public.bookings (session_id, user_id, status, class_fee, total, not_pregnant_confirmed, agreed_at, hold_expires_at)
      values ($1, $2, 'awaiting_verification', 500, 500, true, now(), now() - interval '1 hour') returning id`,
      [sessionId, t.users[userKey]])).id;
    const p = (await one(`
      insert into public.payments (booking_id, provider, method, amount, screenshot_path)
      values ($1, 'manual', 'gcash', 500, 'x.png') returning id`, [b])).id;
    return { b, p };
  };
  const approveMe = await makeManual('D', S[3]);
  const rejectMe = await makeManual('E', S[3]);
  const seatsBefore = await seatsLeft(S[3]);
  check('Awaiting verification holds a seat (even with an old hold time)', '2 seats taken', seatsBefore === 2, `${4 - seatsBefore} seats taken`);

  r = await as('admin', 'select public.admin_review_manual_payment($1, true) as s', [approveMe.p]);
  const p1 = await one('select status, verified_by from public.payments where id = $1', [approveMe.p]);
  check('Approve a manual payment', 'booking confirmed, payment paid (by the admin)',
    r.ok && (await status(approveMe.b)) === 'confirmed' && p1.status === 'paid' && p1.verified_by === admin,
    r.ok ? `${await status(approveMe.b)}, ${p1.status}` : r.err);

  r = await as('admin', 'select public.admin_review_manual_payment($1, false) as s', [rejectMe.p]);
  const p2 = await one('select status from public.payments where id = $1', [rejectMe.p]);
  check('Reject a manual payment', 'booking expired, payment rejected, seat freed',
    r.ok && (await status(rejectMe.b)) === 'expired' && p2.status === 'rejected' && (await seatsLeft(S[3])) === seatsBefore + 1,
    r.ok ? `${await status(rejectMe.b)}, ${p2.status}, seats left ${seatsBefore} -> ${await seatsLeft(S[3])}` : r.err);

  r = await as('admin', 'select public.admin_review_manual_payment($1, true) as s', [approveMe.p]);
  check('Review the same payment twice', 'refused', !r.ok && r.err.includes('already reviewed'), r.err);

  // ===========================================================================
  t.section('Deactivating an account');
  // ===========================================================================
  r = await as('F', 'update public.profiles set is_active = false where id = $1 returning id', [t.users.F]);
  check('Client sets is_active directly', 'refused (trigger)', !r.ok, r.err);
  r = await as('F', 'select public.deactivate_my_account()');
  const fActive = (await one('select is_active from public.profiles where id = $1', [t.users.F])).is_active;
  check('Client uses deactivate_my_account()', 'is_active = false', r.ok && fActive === false, r.ok ? `is_active = ${fActive}` : r.err);
  r = await book('F', S[4]);
  check('Deactivated client tries to book', 'refused', !r.ok && r.err.includes('deactivated'), r.err);
  r = await as('F', 'update public.profiles set is_active = true where id = $1 returning id', [t.users.F]);
  check('Deactivated client reactivates themself', 'refused', !r.ok, r.err);
  r = await as('admin', 'update public.profiles set is_active = true where id = $1 returning id', [t.users.F]);
  check('Admin reactivates the client', 'allowed', r.ok && r.rows.length === 1, r.ok ? 'allowed' : r.err);
}
