// Tests for the cancellation table in CLAUDE.md section 5 (migration 3:
// cancel_my_booking, transfer_my_booking, admin_cancel_session):
//   more than 24h -> transfer once | 12-24h -> 50% code | under 12h -> forfeited
//   cafe cancels the class -> free transfer
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Cancel and transfer rules';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, seatsLeft, status, sessionIn, confirmedBooking } = t;
  for (const key of ['A', 'B', 'G']) await t.addUser(key);
  await t.addUser('admin', { admin: true });
  const S = await t.emptySessions(3);

  // Confirmed bookings for client A in classes 30, 18 and 6 hours away.
  const W30 = await confirmedBooking(await sessionIn(30), 'A');
  const W18 = await confirmedBooking(await sessionIn(18), 'A');
  const W6 = await confirmedBooking(await sessionIn(6), 'A');

  // ===========================================================================
  t.section('Cancelling');
  // ===========================================================================
  let r = await as('A', 'select * from public.cancel_my_booking($1)', [W30]);
  check('Cancel 30h before class', 'refused: use Transfer instead', !r.ok && r.err.includes('Transfer') && (await status(W30)) === 'confirmed', r.err);

  r = await as('B', 'select * from public.cancel_my_booking($1)', [W30]);
  check("B tries to cancel A's booking", 'refused', !r.ok && r.err.includes("couldn't find"), r.err);

  r = await as('A', 'select * from public.cancel_my_booking($1)', [W18]);
  const v = r.ok ? await one(`
    select percent_off, owner_id, uses_left, source, round(extract(epoch from expires_at - now()) / 86400)::int as days
    from public.vouchers where code = $1`, [r.row.voucher_code]) : null;
  check('Cancel 18h before class', 'cancelled_with_voucher + personal 50% code, 60 days, 1 use',
    r.ok && r.row.new_status === 'cancelled_with_voucher' && v.percent_off === '50.00' && v.owner_id === t.users.A
      && v.uses_left === 1 && v.days === 60 && v.source === 'cancellation',
    r.ok ? `${r.row.new_status}, ${r.row.voucher_code}: ${v.percent_off}%, ${v.days} days, ${v.uses_left} use` : r.err);

  // The new code works only for A, and only on the class fee.
  const code = r.row?.voucher_code;
  r = await t.attempt('A', 'select discount from public.check_voucher($1)', [code]);
  const rB = await t.attempt('B', 'select discount from public.check_voucher($1)', [code]);
  check('The 50% code: A can use it, B cannot', 'A: discount 250.00, B: refused',
    r.ok && r.row.discount === '250.00' && !rB.ok, `A: ${r.ok ? r.row.discount : r.err}, B: ${rB.ok ? 'allowed!' : rB.err}`);

  r = await as('A', 'select * from public.cancel_my_booking($1)', [W6]);
  check('Cancel 6h before class', 'forfeited, no voucher', r.ok && r.row.new_status === 'forfeited' && r.row.voucher_code === null,
    r.ok ? `${r.row.new_status}, voucher ${r.row.voucher_code}` : r.err);

  r = await as('A', 'select * from public.cancel_my_booking($1)', [W18]);
  check('Cancel the same booking twice', 'refused', !r.ok, r.err);

  const started = await confirmedBooking(await sessionIn(-0.25), 'A');
  r = await as('A', 'select * from public.cancel_my_booking($1)', [started]);
  check('Cancel after class started', 'refused', !r.ok && r.err.includes('already started'), r.err);

  // ===========================================================================
  t.section('Transferring');
  // ===========================================================================
  const before = await seatsLeft(S[0]);
  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [W30, S[0]]);
  const moved = r.row?.id;
  const nb = moved ? await one('select status, transferred_from, mat_rental, drink_choice, total from public.bookings where id = $1', [moved]) : null;
  check('Transfer 30h before class', 'old = transferred, new = confirmed with the same mat, drink and total',
    r.ok && (await status(W30)) === 'transferred' && nb.status === 'confirmed' && nb.transferred_from === W30
      && nb.mat_rental && nb.drink_choice === 'Iced Matcha' && nb.total === '550.00',
    r.ok ? `old ${await status(W30)}, new ${nb.status} (mat ${nb.mat_rental}, ${nb.drink_choice}, ${nb.total})` : r.err);
  check('The new class has one seat fewer', `${before - 1}`, (await seatsLeft(S[0])) === before - 1, await seatsLeft(S[0]));

  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [moved, S[1]]);
  check('Transfer the new booking again', 'refused (once only)', !r.ok && r.err.includes('only be transferred one time'), r.err);
  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [W30, S[1]]);
  check('Transfer the old (already moved) booking again', 'refused', !r.ok, r.err);

  const W20 = await confirmedBooking(await sessionIn(20), 'A');
  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [W20, S[1]]);
  check('Transfer 20h before class', 'refused (only more than 24h before)', !r.ok && r.err.includes('24 hours'), r.err);

  // A full class: capacity 1, and B already has the seat.
  const full = await sessionIn(5 * 24, 1);
  await confirmedBooking(full, 'B');
  const G40 = await confirmedBooking(await sessionIn(40), 'G');
  r = await as('G', 'select public.transfer_my_booking($1, $2) as id', [G40, full]);
  check('Transfer into a full class', 'refused', !r.ok && r.err.includes('full'), r.err);

  // ===========================================================================
  t.section('The cafe cancels a class -> free transfer');
  // ===========================================================================
  const s10 = await sessionIn(10);
  const B10 = await confirmedBooking(s10, 'B');
  r = await as('admin', 'select public.admin_cancel_session($1) as n', [s10]);
  check('Admin cancels a class 10h away', 'cancelled, 1 booking to tell', r.ok && r.row.n === 1, r.ok ? `${r.row.n} booking(s) to tell` : r.err);
  r = await t.attempt('guest', 'select state from public.get_open_sessions() where session_id = $1', [s10]);
  check('Class shows as cancelled', "state 'cancelled'", r.row?.state === 'cancelled', r.row?.state ?? r.err);
  r = await as('B', 'select * from public.cancel_my_booking($1)', [B10]);
  check('Client tries to cancel in a cafe-cancelled class', 'refused: use the free Transfer', !r.ok && r.err.includes('for free'), r.err);
  r = await as('B', 'select public.transfer_my_booking($1, $2) as id', [B10, S[1]]);
  check('Free transfer out of the cancelled class (only 10h before)', 'succeeds', r.ok, r.ok ? 'succeeded' : r.err);
  // A booking 50h away (so the 24h rule allows a transfer) tries to move INTO the cancelled class.
  const W50 = await confirmedBooking(await sessionIn(50), 'A');
  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [W50, s10]);
  check('Transfer INTO a cancelled class', 'refused (not open)', !r.ok && r.err.includes('not open'), r.err);
}
