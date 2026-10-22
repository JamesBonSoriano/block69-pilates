// Tests for migration 8, the My Account pages:
//   - get_my_bookings, get_my_payments and get_my_vouchers only ever give
//     back the CALLER's own rows (admins too), and guests can't call them
//   - the cancel / transfer rule My Bookings shows ("change_rule") always
//     matches what cancel_my_booking and transfer_my_booking really do
//   - Upcoming / Past, transfers ("moved from" / "moved to"), payments after
//     a transfer, and the voucher states (active, reserved, used, expired)
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'My Account: my bookings, payments and vouchers (migration 8)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, attempt, book, status, sessionIn, confirmedBooking, users } = t;
  for (const key of ['A', 'B']) await t.addUser(key);
  await t.addUser('admin', { admin: true });
  const S = await t.emptySessions(3);

  // Small helpers: each person's lists, as they'd see them on the website.
  const myBookings = async (actor) => (await attempt(actor, 'select * from public.get_my_bookings()')).rows ?? [];
  const myPayments = async (actor, id = null) =>
    (await attempt(actor, 'select * from public.get_my_payments($1)', [id])).rows ?? [];
  const myVouchers = async (actor) => (await attempt(actor, 'select * from public.get_my_vouchers()')).rows ?? [];
  // One booking from A's list (or undefined if it isn't listed).
  const rowOf = async (actor, bookingId) => (await myBookings(actor)).find((b) => b.booking_id === bookingId);
  // Adds a paid GCash payment to a booking. Gives back the payment id.
  const pay = async (bookingId, amount = 550) => (await one(`
    insert into public.payments (booking_id, provider, method, amount, status, paid_at, paymongo_ref)
    values ($1, 'paymongo', 'gcash', $2, 'paid', now(), 'pay_' || gen_random_uuid())
    returning id`, [bookingId, amount])).id;

  // Confirmed bookings for A in classes 30, 18 and 6 hours away (each rule).
  const W30 = await confirmedBooking(await sessionIn(30), 'A');
  const W18 = await confirmedBooking(await sessionIn(18), 'A');
  const W6 = await confirmedBooking(await sessionIn(6), 'A');
  const payW30 = await pay(W30);
  // B and the admin each have a booking of their own.
  const B1 = await confirmedBooking(S[2], 'B');
  const payB1 = await pay(B1);
  const ADM = await confirmedBooking(S[3], 'admin');

  // ===========================================================================
  t.section('Only your own rows');
  // ===========================================================================
  let ids = (await myBookings('A')).map((b) => b.booking_id).sort();
  check("A's bookings", "exactly A's 3 bookings", ids.join() === [W30, W18, W6].sort().join(), `${ids.length} rows`);
  ids = (await myBookings('B')).map((b) => b.booking_id);
  check("B's bookings", "only B's 1 booking", ids.length === 1 && ids[0] === B1, `${ids.length} rows`);
  ids = (await myBookings('admin')).map((b) => b.booking_id);
  check("An admin's My Bookings", "only the admin's OWN booking (not A's or B's)",
    ids.length === 1 && ids[0] === ADM, `${ids.length} rows`);

  let r = await attempt('guest', 'select * from public.get_my_bookings()');
  const rP = await attempt('guest', 'select * from public.get_my_payments()');
  const rV = await attempt('guest', 'select * from public.get_my_vouchers()');
  check('A guest calls the 3 functions', 'all refused', !r.ok && !rP.ok && !rV.ok, `${r.err} | ${rP.err} | ${rV.err}`);

  ids = (await myPayments('A')).map((p) => p.payment_id);
  check("A's payments", "only A's 1 payment", ids.length === 1 && ids[0] === payW30, `${ids.length} rows`);
  ids = (await myPayments('admin')).map((p) => p.payment_id);
  check("An admin's Payments page", 'none (the admin paid nothing)', ids.length === 0, `${ids.length} rows`);
  ids = (await myPayments('A', payB1)).map((p) => p.payment_id);
  check("A opens the receipt of B's payment", 'nothing (0 rows)', ids.length === 0, `${ids.length} rows`);
  ids = (await myPayments('A', payW30)).map((p) => p.payment_id);
  check('A opens their own receipt', '1 row', ids.length === 1 && ids[0] === payW30, `${ids.length} rows`);

  r = await attempt('A', `select public.change_rule(current_date, '09:00', 'open', null)`);
  const r2 = await attempt('A', 'select public.booking_moved_to($1)', [W30]);
  check('A calls the private helpers (change_rule, booking_moved_to)', 'both refused', !r.ok && !r2.ok, `${r.err} | ${r2.err}`);

  // ===========================================================================
  t.section('What Cancel will do = what Cancel does');
  // ===========================================================================
  const rules = {};
  for (const [name, id] of [['30h', W30], ['18h', W18], ['6h', W6]]) {
    const row = await rowOf('A', id);
    rules[name] = `${row?.change_rule}/${row?.can_transfer}`;
  }
  check('The rules My Bookings shows (30h, 18h, 6h)', 'transfer/true, voucher/false, no_credit/false',
    rules['30h'] === 'transfer/true' && rules['18h'] === 'voucher/false' && rules['6h'] === 'no_credit/false',
    `${rules['30h']}, ${rules['18h']}, ${rules['6h']}`);

  r = await as('A', 'select * from public.cancel_my_booking($1)', [W30]);
  check('30h ("transfer"): cancel', 'refused: use Transfer (still confirmed)',
    !r.ok && r.err.includes('Transfer') && (await status(W30)) === 'confirmed', r.err);
  r = await as('A', 'select * from public.cancel_my_booking($1)', [W18]);
  const cancelCode = r.row?.voucher_code;
  check('18h ("voucher"): cancel', 'cancelled_with_voucher + a code',
    r.ok && r.row.new_status === 'cancelled_with_voucher' && Boolean(cancelCode), r.ok ? `${r.row.new_status}, ${cancelCode}` : r.err);
  r = await as('A', 'select * from public.cancel_my_booking($1)', [W6]);
  check('6h ("no_credit"): cancel', 'forfeited, no code',
    r.ok && r.row.new_status === 'forfeited' && r.row.voucher_code === null, r.ok ? r.row.new_status : r.err);

  let row = await rowOf('A', W18);
  check('After cancelling: the 18h booking', 'in Past, no rule any more (not confirmed)',
    row && !row.is_upcoming && row.change_rule === null && !row.can_transfer, row && `${row.status}, upcoming ${row.is_upcoming}, rule ${row.change_rule}`);

  const started = await confirmedBooking(await sessionIn(-0.25), 'A');
  row = await rowOf('A', started);
  check('A class that started 15 minutes ago', 'rule "started", no transfer, still Upcoming (not over yet)',
    row?.change_rule === 'started' && !row.can_transfer && row.is_upcoming, row && `${row.change_rule}, ${row.can_transfer}, ${row.is_upcoming}`);

  // ===========================================================================
  t.section('Transfers: moved from / moved to, and only once');
  // ===========================================================================
  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [W30, S[0]]);
  const moved = r.row?.id;
  check('A transfers the 30h booking', 'allowed', r.ok, r.ok ? 'moved' : r.err);

  const newClass = await one('select date, start_time from public.class_sessions where id = $1', [S[0]]);
  const oldClass = await one(`select s.date, s.start_time from public.bookings b join public.class_sessions s on s.id = b.session_id where b.id = $1`, [W30]);
  row = await rowOf('A', moved);
  check('The new booking', 'confirmed, "moved from" the old class, rule already_transferred, no transfer',
    row?.status === 'confirmed' && String(row.moved_from_date) === String(oldClass.date)
      && row.moved_from_start_time === oldClass.start_time && row.change_rule === 'already_transferred' && !row.can_transfer,
    row && `${row.status}, from ${row.moved_from_date ? 'old class' : 'nothing'}, ${row.change_rule}, ${row.can_transfer}`);
  check('The new booking shows the payment of the original', 'paid 550.00 with gcash',
    row?.paid_amount === '550.00' && row.paid_method === 'gcash', row && `${row.paid_amount} ${row.paid_method}`);
  const oldRow = await rowOf('A', W30);
  check('The old booking', 'transferred, in Past, "moved to" the new class',
    oldRow?.status === 'transferred' && !oldRow.is_upcoming && String(oldRow.moved_to_date) === String(newClass.date)
      && oldRow.moved_to_start_time === newClass.start_time,
    oldRow && `${oldRow.status}, upcoming ${oldRow.is_upcoming}, to ${oldRow.moved_to_date ? 'new class' : 'nothing'}`);

  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [moved, S[1]]);
  check('"already_transferred": transfer again', 'refused (once only), same message as before',
    !r.ok && r.err.includes('only be transferred one time'), r.err);
  r = await as('A', 'select * from public.cancel_my_booking($1)', [moved]);
  check('"already_transferred": cancel', 'refused, explains "from 24 hours before class"',
    !r.ok && r.err.includes('from 24 hours before class'), r.err);

  const p = (await myPayments('A', payW30))[0];
  check('Payments: the original payment after the transfer', 'still listed once, paid for the OLD class, "now" = the new class',
    p && String(p.class_date) === String(oldClass.date) && String(p.now_date) === String(newClass.date)
      && p.now_start_time === newClass.start_time && (await myPayments('A')).length === 1,
    p && `paid for old class: ${String(p.class_date) === String(oldClass.date)}, now: ${p.now_date ? 'new class' : 'nothing'}`);

  // The cafe cancels a class that has already passed, before the client moved.
  const past = await sessionIn(-3);
  const P1 = await confirmedBooking(past, 'B');
  await as('admin', 'select public.admin_cancel_session($1)', [past]);
  row = await rowOf('B', P1);
  check('Cafe cancelled a class (3 hours ago), not moved yet', 'rule free_transfer, can transfer, still in Upcoming',
    row?.change_rule === 'free_transfer' && row.can_transfer && row.is_upcoming, row && `${row.change_rule}, ${row.can_transfer}, ${row.is_upcoming}`);
  r = await as('B', 'select public.transfer_my_booking($1, $2) as id', [P1, S[1]]);
  check('... and the free transfer really works', 'allowed', r.ok, r.ok ? 'moved' : r.err);
  row = await rowOf('B', P1);
  check('... after it', 'the old booking moves to Past', row && !row.is_upcoming && row.status === 'transferred', row && `${row.status}, ${row.is_upcoming}`);

  // ===========================================================================
  t.section('Unpaid holds and the Past list');
  // ===========================================================================
  r = await book('A', S[4]);
  const hold = r.row?.booking_id;
  row = await rowOf('A', hold);
  check('A live unpaid hold', 'listed, Upcoming, with seconds left',
    row?.status === 'pending_payment' && row.is_upcoming && row.hold_seconds_left > 0 && row.change_rule === null,
    row && `${row.status}, ${row.is_upcoming}, ${row.hold_seconds_left}s`);
  await q(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [hold]);
  check('The hold runs out', 'no longer listed', !(await rowOf('A', hold)), (await rowOf('A', hold)) ? 'still listed' : 'gone');
  r = await book('A', S[4]);
  const hold2 = r.row?.booking_id;
  await as('A', 'select public.release_my_hold($1)', [hold2]);
  check('A hold given up with "Change details" (expired)', 'not listed', !(await rowOf('A', hold2)), (await rowOf('A', hold2)) ? 'still listed' : 'gone');

  const done = await confirmedBooking(await sessionIn(-48), 'A');
  await q(`update public.bookings set status = 'attended' where id = $1`, [done]);
  row = await rowOf('A', done);
  check('A class 2 days ago, attended', 'listed in Past', row && !row.is_upcoming && row.status === 'attended', row && `${row.status}, ${row.is_upcoming}`);

  // ===========================================================================
  t.section('Vouchers: only your own, and their state');
  // ===========================================================================
  await q(`insert into public.vouchers (code, percent_off, source, uses_left) values ('PROMO10', 10, 'promo', 100)`);
  await q(`insert into public.vouchers (code, percent_off, owner_id, source, uses_left, expires_at) values
             ('HALF-BEE001', 50, $1, 'cancellation', 1, now() + interval '30 days'),
             ('HALF-OLD001', 50, $2, 'cancellation', 1, now() - interval '1 day'),
             ('HALF-USED01', 50, $2, 'cancellation', 0, now() + interval '30 days'),
             ('HALF-HOLD01', 50, $2, 'cancellation', 1, now() + interval '10 days')`, [users.B, users.A]);
  // The used code was spent on a class A booked (an original, paid booking).
  const usedOn = await confirmedBooking(await sessionIn(-24 * 5), 'A');
  await q(`update public.bookings set voucher_id = (select id from public.vouchers where code = 'HALF-USED01') where id = $1`, [usedOn]);
  // The "hold" code is on an unpaid booking right now.
  r = await book('A', S[5], { code: 'HALF-HOLD01' });
  check('A holds a seat with HALF-HOLD01', 'held', r.ok, r.ok ? 'held' : r.err);

  const mine = await myVouchers('A');
  const states = Object.fromEntries(mine.map((v) => [v.code, v.state]));
  check("A's vouchers", "only A's 4 personal codes (not PROMO10, not B's)",
    mine.length === 4 && !states.PROMO10 && !states['HALF-BEE001'], mine.map((v) => v.code).join(', '));
  check('Their states', 'cancel code active, HOLD reserved, USED used, OLD expired',
    states[cancelCode] === 'active' && states['HALF-HOLD01'] === 'reserved' && states['HALF-USED01'] === 'used'
      && states['HALF-OLD001'] === 'expired', JSON.stringify(states));
  check('Order', 'active, reserved, used, expired', mine.map((v) => v.state).join() === 'active,reserved,used,expired',
    mine.map((v) => v.state).join());
  const usedClass = await one(`select s.date from public.bookings b join public.class_sessions s on s.id = b.session_id where b.id = $1`, [usedOn]);
  const used = mine.find((v) => v.code === 'HALF-USED01');
  check('The used code says which class it was used on', 'the class date',
    used && String(used.used_for_date) === String(usedClass.date), used && String(used.used_for_date));
  const bees = await myVouchers('B');
  check("B's vouchers", 'only HALF-BEE001', bees.length === 1 && bees[0].code === 'HALF-BEE001', bees.map((v) => v.code).join(', '));
  check("An admin's My Vouchers", 'none (promo codes are never listed)', (await myVouchers('admin')).length === 0,
    `${(await myVouchers('admin')).length} rows`);
}
