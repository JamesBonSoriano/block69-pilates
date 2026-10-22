// Tests for the booking pages (Step 9) and migration 6:
//   - get_my_booking(): the pay page and the "You're booked" page only ever
//     see the caller's OWN booking, with the right money, voucher code,
//     payment and seconds left on the hold
//   - get_my_session_booking(): finds an unpaid hold so step 2 can send the
//     person to their pay page instead of an error
//   - the voucher box (check_voucher) never reveals other people's codes and
//     shows the same discount book_seat then saves
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Booking pages: my booking, unpaid holds, voucher preview (migration 6)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, book } = t;
  for (const key of ['A', 'B']) await t.addUser(key);
  await t.addUser('admin', { admin: true });
  const S = await t.emptySessions(3);

  // Test vouchers: a 10% promo, a 1-use promo, and personal codes for B
  // (one valid, one expired).
  await q(`
    insert into public.vouchers (code, percent_off, amount_off, owner_id, source, uses_left, expires_at) values
      ('TEST10', 10, null, null, 'promo', 100, null),
      ('ONEUSE1', 20, null, null, 'promo', 1, null),
      ('HALF-BBBBBB', 50, null, $1, 'cancellation', 1, now() + interval '60 days'),
      ('HALF-BOLD00', 50, null, $1, 'cancellation', 1, now() - interval '1 day')`, [t.users.B]);

  // A small helper: get_my_booking as someone. Gives back the run() result.
  const myBooking = (actor, bookingId) =>
    t.attempt(actor, `select *, class_date::text as day from public.get_my_booking($1)`, [bookingId]);
  // And get_my_session_booking as someone.
  const mySessionBooking = (actor, sessionId) =>
    t.attempt(actor, 'select * from public.get_my_session_booking($1)', [sessionId]);

  // ===========================================================================
  t.section('get_my_booking (pay page and booked page)');
  // ===========================================================================
  let r = await book('A', S[0], { mat: true, code: 'TEST10' });
  const aBooking = r.row?.booking_id;
  check('A books with a mat and the TEST10 promo', 'pending_payment hold', r.ok, r.ok ? 'booked' : r.err);

  r = await myBooking('A', aBooking);
  const day = (await one('select date::text as d from public.class_sessions where id = $1', [S[0]])).d;
  check('A opens their own booking', 'one row: pending_payment, TEST10, 500 + 50 - 50 = 500, right class',
    r.ok && r.rows.length === 1 && r.row.status === 'pending_payment' && r.row.voucher_code === 'TEST10'
      && r.row.class_fee === '500.00' && r.row.mat_fee === '50.00' && r.row.discount === '50.00'
      && r.row.total === '500.00' && r.row.day === day && r.row.session_id === S[0],
    r.ok ? `${r.rows.length} row: ${r.row?.status}, ${r.row?.voucher_code}, total ${r.row?.total}, ${r.row?.day}` : r.err);
  check('Hold seconds left (database clock)', 'about 900 (15 minutes)',
    r.ok && r.row.hold_seconds_left > 880 && r.row.hold_seconds_left <= 900, r.row?.hold_seconds_left);
  check('Not paid yet', 'no payment', r.ok && r.row.paid_amount === null && r.row.paid_method === null,
    `${r.row?.paid_amount} ${r.row?.paid_method}`);

  r = await myBooking('B', aBooking);
  check("B opens A's booking", 'no rows (looks like it does not exist)', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);
  r = await myBooking('admin', aBooking);
  check("An admin opens A's booking on the client pay page", 'no rows (owner only)', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);
  r = await myBooking('guest', aBooking);
  check("A guest opens A's booking", 'refused', !r.ok, r.err);
  r = await myBooking('A', '00000000-0000-0000-0000-000000000000');
  check('A booking id that does not exist', 'no rows', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);

  // Pretend 15 minutes passed.
  await q("update public.bookings set hold_expires_at = now() - interval '1 second' where id = $1", [aBooking]);
  r = await myBooking('A', aBooking);
  check('After the hold ends', 'still pending_payment, 0 seconds left (page shows "seat released")',
    r.ok && r.row.status === 'pending_payment' && r.row.hold_seconds_left === 0,
    r.ok ? `${r.row.status}, ${r.row.hold_seconds_left} s` : r.err);

  r = await t.attempt('A', 'select public.booking_family($1)', [aBooking]);
  check('Client calls the private booking_family helper', 'refused', !r.ok, r.err);

  // ===========================================================================
  t.section('get_my_session_booking (unpaid hold -> back to the pay page)');
  // ===========================================================================
  r = await book('A', S[1]);
  const hold = r.row?.booking_id;
  r = await mySessionBooking('A', S[1]);
  check('A has a live unpaid hold in this class', 'finds it: pending_payment, same booking',
    r.ok && r.rows.length === 1 && r.row.booking_id === hold && r.row.status === 'pending_payment',
    r.ok ? `${r.rows.length} row: ${r.row?.status}` : r.err);
  r = await book('A', S[1]);
  check('A clicks Confirm again (double click / back button)', 'book_seat refuses: already on hold',
    !r.ok && r.err.includes('already have a seat on hold'), r.err);
  r = await mySessionBooking('B', S[1]);
  check("B asks about the same class", "no rows (never sees A's hold)", r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);

  await q("update public.bookings set hold_expires_at = now() - interval '1 second' where id = $1", [hold]);
  r = await mySessionBooking('A', S[1]);
  check("After A's hold ends", 'no rows (step 2 shows the form again)', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);
  r = await book('A', S[1]);
  const second = r.row?.booking_id;
  check('A books the same class again', 'succeeds (new hold)', r.ok && second !== hold, r.ok ? 'booked' : r.err);

  await q("update public.bookings set status = 'confirmed' where id = $1", [second]);
  r = await mySessionBooking('A', S[1]);
  check('Once it is confirmed', 'finds it: confirmed', r.ok && r.row?.status === 'confirmed', r.ok ? r.row?.status : r.err);
  r = await mySessionBooking('guest', S[1]);
  check('A guest calls get_my_session_booking', 'refused', !r.ok, r.err);

  // ===========================================================================
  t.section('Payment shown on the booked page');
  // ===========================================================================
  // A confirmed booking with a paid GCash payment (like the webhook will save).
  const paid = await t.confirmedBooking(S[2], 'A');
  await q(`insert into public.payments (booking_id, provider, method, amount, status, paid_at)
           values ($1, 'paymongo', 'gcash', 550, 'paid', now())`, [paid]);
  r = await myBooking('A', paid);
  check('Confirmed booking with a GCash payment', 'confirmed, paid 550.00 with gcash, 0 hold seconds',
    r.ok && r.row.status === 'confirmed' && r.row.paid_amount === '550.00' && r.row.paid_method === 'gcash' && r.row.hold_seconds_left === 0,
    r.ok ? `${r.row.status}, ${r.row.paid_amount} ${r.row.paid_method}` : r.err);

  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [paid, S[3]]);
  const moved = r.row?.id;
  r = await myBooking('A', moved);
  check('After a transfer, the new booking shows the original payment', 'paid 550.00 with gcash',
    r.ok && r.row?.paid_amount === '550.00' && r.row?.paid_method === 'gcash',
    r.ok ? `${r.row?.paid_amount} ${r.row?.paid_method}` : r.err);

  // A failed payment attempt must not show as paid.
  r = await book('A', S[4]);
  const unpaid = r.row?.booking_id;
  await q(`insert into public.payments (booking_id, provider, method, amount, status)
           values ($1, 'paymongo', 'card', 500, 'failed')`, [unpaid]);
  r = await myBooking('A', unpaid);
  check('A failed payment attempt', 'not shown as paid', r.ok && r.row.paid_amount === null, r.ok ? r.row.paid_amount : r.err);

  // ===========================================================================
  t.section('Voucher box (check_voucher) never reveals other people\'s codes');
  // ===========================================================================
  const made = await t.attempt('A', "select * from public.check_voucher('NOPE-123')");
  const bValid = await t.attempt('A', "select * from public.check_voucher('HALF-BBBBBB')");
  const bOld = await t.attempt('A', "select * from public.check_voucher('HALF-BOLD00')");
  check("A types a made-up code, B's code, and B's EXPIRED code", 'the same "isn\'t valid" message for all 3',
    !made.ok && !bValid.ok && !bOld.ok && made.err === bValid.err && bValid.err === bOld.err && made.err.includes("isn't valid"),
    `${made.err} | ${bValid.err} | ${bOld.err}`);
  r = await t.attempt('B', "select * from public.check_voucher('HALF-BOLD00')");
  check('B types their own expired code', 'told it has expired', !r.ok && r.err.includes('expired'), r.err);
  r = await t.attempt('B', "select * from public.check_voucher('half-bbbbbb')");
  check('B types their own code in small letters', 'discount 250.00 (50% of the class fee)', r.ok && r.row.discount === '250.00', r.ok ? r.row.discount : r.err);

  r = await t.attempt('B', "select * from public.check_voucher('TEST10')");
  const preview = r.row?.discount;
  r = await book('B', S[5], { mat: true, code: 'TEST10' });
  check('Preview discount = what book_seat saves', 'both 50.00 (class fee only, mat not discounted)',
    preview === '50.00' && r.ok && r.row.discount === '50.00' && r.row.total === '500.00',
    `preview ${preview}, saved ${r.row?.discount}, total ${r.row?.total}`);

  await as('A', "select * from public.check_voucher('ONEUSE1')");
  r = await book('B', S[6], { code: 'ONEUSE1' });
  check('A previews a 1-use code, then B books with it', 'B succeeds (a preview reserves nothing)', r.ok, r.ok ? 'booked' : r.err);

  r = await t.attempt('guest', "select * from public.check_voucher('TEST10')");
  check('A guest tries the voucher box', 'refused (must log in)', !r.ok, r.err);
}
