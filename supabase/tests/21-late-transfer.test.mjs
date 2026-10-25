// Tests for migration 19 (..._late_transfer.sql): clients move their own
// LATE payments ('paid_needs_action') to another class.
//   - the client can move their own late-paid booking, free, even when the
//     old class is less than 24 hours away or already over
//   - a client can't move someone else's late-paid booking
//   - get_my_bookings shows it with rule 'late_payment' and can_transfer
//   - the new class must still have a free seat
//   - a payment that doesn't cover the total can't be moved here
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.4: clients transfer their own late payments';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, attempt, status, sessionIn } = t;
  const users = {};
  for (const key of ['A', 'B', 'C']) users[key] = await t.addUser(key);

  // Adds a late-paid booking ('paid_needs_action') with a paid payment.
  // Takes: the class id, the user key and the amount paid (default: the full 550).
  // Gives back: the booking id.
  async function latePaid(sessionId, userKey, paid = 550) {
    const id = (await one(`
      insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice,
                                   class_fee, mat_fee, total, agreed_at)
      values ($1, $2, 'paid_needs_action', true, 'Iced Matcha', 500, 50, 550, now())
      returning id`, [sessionId, users[userKey]])).id;
    await t.pay(id, paid);
    return id;
  }
  // A's row for one booking in get_my_bookings (as A).
  const myRow = async (actor, bookingId) =>
    (await attempt(actor, 'select * from public.get_my_bookings() where booking_id = $1', [bookingId])).row;
  // Moves a booking as someone (kept if it works).
  const move = (actor, bookingId, sessionId) =>
    as(actor, 'select public.transfer_my_booking($1, $2) as id', [bookingId, sessionId]);

  const [target, other] = await t.emptySessions(3);

  // ===========================================================================
  t.section('My Bookings shows the late payment');
  // ===========================================================================
  // The old class is 6 hours away: a normal booking couldn't be moved now
  const late = await latePaid(await sessionIn(6), 'A');
  let row = await myRow('A', late);
  check('get_my_bookings for the late booking', "rule late_payment, can_transfer, upcoming",
    row?.change_rule === 'late_payment' && row.can_transfer === true && row.is_upcoming === true,
    row && `${row.change_rule}, ${row.can_transfer}, ${row.is_upcoming}`);

  // Even after its class is over, it stays in view and can be moved
  const lateOld = await latePaid(await sessionIn(-48), 'C');
  row = await myRow('C', lateOld);
  check('Late booking for a class that is already over', 'still upcoming, can_transfer',
    row?.is_upcoming === true && row.can_transfer === true, row && `${row.is_upcoming}, ${row.can_transfer}`);

  // ===========================================================================
  t.section('Only the owner can move it');
  // ===========================================================================
  let r = await attempt('B', 'select public.transfer_my_booking($1, $2)', [late, target]);
  check("B moves A's late-paid booking", "refused (couldn't find)", !r.ok && /couldn't find that booking/.test(r.err), r.err ?? 'ALLOWED');
  check("A's booking after B's try", 'still paid_needs_action', (await status(late)) === 'paid_needs_action', await status(late));
  r = await attempt('guest', 'select public.transfer_my_booking($1, $2)', [late, target]);
  check('A guest moves it', 'refused', !r.ok, r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('The owner moves it (free, no 24-hour rule)');
  // ===========================================================================
  r = await move('A', late, target);
  const moved = r.row?.id;
  check('A moves their late-paid booking 6 hours before the old class', 'a new booking',
    r.ok && !!moved, r.err ?? 'no id');
  check('Old booking', 'transferred', (await status(late)) === 'transferred', await status(late));
  check('New booking', 'confirmed', moved && (await status(moved)) === 'confirmed', moved && await status(moved));
  const fresh = await one('select transferred_from, total, mat_rental from public.bookings where id = $1', [moved]);
  check('New booking keeps the link and amounts', 'points back, total 550, mat kept',
    fresh.transferred_from === late && fresh.total === '550.00' && fresh.mat_rental === true, JSON.stringify(fresh));
  row = await myRow('A', moved);
  check('The new booking in My Bookings', 'shows the paid 550 (from the old booking)', row?.paid_amount === '550.00',
    row && String(row.paid_amount));

  r = await attempt('A', 'select public.transfer_my_booking($1, $2)', [moved, other]);
  check('Move the new booking again (more than 24h away)', 'refused (only once)', !r.ok && /only be transferred one time/.test(r.err),
    r.err ?? 'ALLOWED');

  // The old class's late booking (class over) can be moved too
  r = await move('C', lateOld, other);
  check('C moves a late booking whose class is over', 'moved', r.ok && (await status(lateOld)) === 'transferred', r.err ?? await status(lateOld));

  // ===========================================================================
  t.section('Seats and money still count');
  // ===========================================================================
  const full = await sessionIn(72, 1);
  await t.confirmedBooking(full, 'C');
  const lateB = await latePaid(await sessionIn(5), 'B');
  r = await attempt('B', 'select public.transfer_my_booking($1, $2)', [lateB, full]);
  check('Move a late booking into a full class', 'refused (full)', !r.ok && /full/.test(r.err), r.err ?? 'ALLOWED');

  const under = await latePaid(await sessionIn(7), 'C', 100);
  row = await myRow('C', under);
  check('Late booking paid only 100 of 550', 'can_transfer false', row?.can_transfer === false, row && String(row.can_transfer));
  r = await attempt('C', 'select public.transfer_my_booking($1, $2)', [under, target]);
  check('Move it anyway', "refused (doesn't match the total)", !r.ok && /doesn't match the booking total/.test(r.err), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('The helper is private');
  // ===========================================================================
  for (const actor of ['guest', 'A']) {
    r = await attempt(actor, 'select public.booking_paid_enough($1)', [lateB]);
    check(`${actor} calls booking_paid_enough directly`, 'refused', !r.ok, r.err ?? 'ALLOWED');
  }
}
