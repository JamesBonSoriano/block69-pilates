// Tests for migration 7: the pay page's "Change details" button
// (release_my_hold), and get_my_booking giving back the choices step 2 fills in.
//   - only the booking's owner can release it, only while it's pending_payment
//   - releasing frees the seat and the voucher at once, and spends nothing
//   - the old booking keeps the choices (drink, mat, first time, notes, code)
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Change details: release my own unpaid hold (migration 7)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, book, seatsLeft, status } = t;
  for (const key of ['A', 'B']) await t.addUser(key);
  await t.addUser('admin', { admin: true });
  const S = await t.emptySessions(3);

  // A 1-use promo code, so we can see it come back after a release.
  await q(`insert into public.vouchers (code, percent_off, source, uses_left) values ('ONCE20', 20, 'promo', 1)`);
  const usesLeft = async () => (await one(`select uses_left from public.vouchers where code = 'ONCE20'`)).uses_left;

  // A releases this hold (a 1-seat class, so we can see the seat come back).
  const release = (actor, bookingId) => as(actor, 'select public.release_my_hold($1) as session_id', [bookingId]);

  // A books the only seat with a mat, a drink, health notes, first time, and the code.
  await q('update public.class_sessions set capacity = 1 where id = $1', [S[0]]);
  let r = await as('A', `select * from public.book_seat(p_session_id => $1, p_not_pregnant => true, p_agreed => true,
                           p_mat_rental => true, p_drink_choice => 'Iced Matcha', p_first_time => true,
                           p_health_notes => 'Old knee injury', p_voucher_code => 'ONCE20')`, [S[0]]);
  const hold = r.row?.booking_id;
  check('A holds the only seat (mat, drink, notes, ONCE20)', 'held', r.ok, r.ok ? 'held' : r.err);

  // ===========================================================================
  t.section('Who may release it');
  // ===========================================================================
  r = await release('B', hold);
  check("B tries to release A's hold", "refused (\"couldn't find\"), still pending",
    !r.ok && r.err.includes("couldn't find") && (await status(hold)) === 'pending_payment', r.err);
  r = await release('admin', hold);
  check("An admin uses the client button on A's hold", 'refused (owner only)',
    !r.ok && (await status(hold)) === 'pending_payment', r.err);
  r = await release('guest', hold);
  check('A guest tries', 'refused', !r.ok && (await status(hold)) === 'pending_payment', r.err);
  r = await release('A', '00000000-0000-0000-0000-000000000000');
  check('A booking id that does not exist', "refused (\"couldn't find\")", !r.ok && r.err.includes("couldn't find"), r.err);

  // ===========================================================================
  t.section('Releasing frees the seat and the code right away');
  // ===========================================================================
  check('Before: seats left / ONCE20 uses left', '0 seats, 1 use (only reserved)',
    (await seatsLeft(S[0])) === 0 && (await usesLeft()) === 1, `${await seatsLeft(S[0])} seats, ${await usesLeft()} use`);
  r = await release('A', hold);
  check('A releases their own hold', 'allowed: gives back the class id, booking expired',
    r.ok && r.row.session_id === S[0] && (await status(hold)) === 'expired',
    r.ok ? `class ${r.row.session_id === S[0] ? 'matches' : 'WRONG'}, ${await status(hold)}` : r.err);
  check('After: seats left', '1 (free at once, no waiting for the timer)', (await seatsLeft(S[0])) === 1, await seatsLeft(S[0]));
  check('After: ONCE20 uses left', '1 (nothing was spent)', (await usesLeft()) === 1, await usesLeft());

  r = await t.attempt('A', 'select * from public.get_my_booking($1)', [hold]);
  check('The released booking keeps the choices (for step 2)', 'Iced Matcha, mat, first time, "Old knee injury", ONCE20',
    r.ok && r.row.drink_choice === 'Iced Matcha' && r.row.mat_rental === true && r.row.first_time === true
      && r.row.health_notes === 'Old knee injury' && r.row.voucher_code === 'ONCE20' && r.row.hold_seconds_left === 0,
    r.ok ? `${r.row.drink_choice}, mat ${r.row.mat_rental}, first ${r.row.first_time}, "${r.row.health_notes}", ${r.row.voucher_code}` : r.err);
  r = await t.attempt('B', 'select * from public.get_my_booking($1)', [hold]);
  check("B reads A's released booking (health notes!)", 'no rows', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);

  r = await release('A', hold);
  check('A presses Change details twice', 'refused the 2nd time (not waiting for payment)',
    !r.ok && r.err.includes('no longer waiting for payment'), r.err);

  r = await book('A', S[0], { mat: false, code: 'ONCE20' });
  check('A books the same class again with new choices and the same code', 'succeeds (new hold)',
    r.ok && r.row.mat_fee === '0.00' && r.row.discount === '100.00', r.ok ? `mat ${r.row.mat_fee}, discount ${r.row.discount}` : r.err);

  // ===========================================================================
  t.section('Only while it is waiting for payment');
  // ===========================================================================
  const paid = await t.confirmedBooking(S[1], 'A');
  r = await release('A', paid);
  check('A tries to release a CONFIRMED (paid) booking', 'refused, still confirmed',
    !r.ok && (await status(paid)) === 'confirmed', r.err);

  r = await book('A', S[2]);
  const ran = r.row?.booking_id;
  await q("update public.bookings set hold_expires_at = now() - interval '1 second' where id = $1", [ran]);
  r = await release('A', ran);
  check('A releases a hold whose timer already ran out', 'allowed (becomes expired)',
    r.ok && (await status(ran)) === 'expired', r.ok ? await status(ran) : r.err);

  r = await book('A', S[3]);
  const deact = r.row?.booking_id;
  await q('update public.profiles set is_active = false where id = $1', [t.users.A]);
  r = await release('A', deact);
  check('A deactivated account tries', 'refused, still pending', !r.ok && (await status(deact)) === 'pending_payment', r.err);
  await q('update public.profiles set is_active = true where id = $1', [t.users.A]);
}
