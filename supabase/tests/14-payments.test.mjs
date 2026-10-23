// Tests for migration 11: payments (Step 12).
//   - start_online_payment / save_online_checkout: owner only, live hold
//     only, a double click reuses the first checkout, switching method
//     expires the old one
//   - confirm_online_payment: ONLY the server key may call it; normal,
//     twice in a row, two at the same moment, late with a free seat, late and
//     full, late after the cafe cancelled, wrong amount, a missing payment
//     row, a checkout for another booking, a second payment
//   - confirm_free_booking: 0-peso bookings only
//   - submit_manual_payment + the screenshot storage policies
//   - admin_billing_summary: today / week / month, mat donations
// Run with: npm run test:db   (see supabase/tests/README.md)

import crypto from 'node:crypto';

export const title = 'Payments: PayMongo checkout, confirm (late rule), manual transfer, billings (migration 11)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, attempt, book, seatsLeft, status, users } = t;
  for (const key of ['A', 'B']) await t.addUser(key);
  await t.addUser('admin', { admin: true });
  const S = await t.emptySessions(3);

  // A made-up PayMongo checkout id, like "cs_test3f9a...".
  const newRef = () => `cs_test${crypto.randomBytes(8).toString('hex')}`;

  // The pay page's calls, as someone.
  const start = (actor, bookingId) => as(actor, 'select * from public.start_online_payment($1)', [bookingId]);
  const save = (actor, bookingId, method, ref, replaces = null) =>
    as(actor, 'select * from public.save_online_checkout($1, $2, $3, $4)', [bookingId, method, ref, replaces]);
  // The webhook / return page's call (the server key by default).
  const confirm = (bookingId, ref, amount, method = 'gcash', actor = 'server', client = t.db) =>
    as(actor, 'select * from public.confirm_online_payment($1, $2, $3, $4, now())', [ref, bookingId, amount, method], client);
  // Ends a hold right now (as if 15 minutes passed).
  const endHold = (bookingId) => q(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [bookingId]);
  // The payment row for one checkout id.
  const paymentFor = (ref) => one('select * from public.payments where paymongo_ref = $1', [ref]);

  // ===========================================================================
  t.section('Billings totals (admin_billing_summary)');
  // ===========================================================================
  // Done first, while these are the only payments in this test database:
  //   today:        550 paid (50 of it mat)
  //   40 days ago:  550 paid (50 of it mat)  -> only in "all time"
  //   today:        a pending and a refunded payment -> never counted
  const today1 = await t.confirmedBooking(S[10], 'A');
  const old1 = await t.confirmedBooking(S[11], 'B');
  await q(`insert into public.payments (booking_id, provider, method, amount, status, paid_at) values
             ($1, 'paymongo', 'gcash', 550, 'paid', now()),
             ($2, 'paymongo', 'card', 550, 'paid', now() - interval '40 days'),
             ($1, 'paymongo', 'maya', 550, 'pending', null),
             ($1, 'paymongo', 'maya', 550, 'refunded', null)`, [today1, old1]);
  let r = await attempt('admin', 'select * from public.admin_billing_summary()');
  const sum = r.row;
  check('Admin: paid today / this week / this month', '550 / 550 / 550 (pending and refunded left out)',
    r.ok && sum.paid_today === '550.00' && sum.paid_this_week === '550.00' && sum.paid_this_month === '550.00',
    r.ok ? `${sum.paid_today} / ${sum.paid_this_week} / ${sum.paid_this_month}` : r.err);
  check('Admin: payments today, mats this month / all time', '1, 50 / 100',
    r.ok && sum.payments_today === 1 && sum.mats_this_month === '50.00' && sum.mats_all_time === '100.00',
    r.ok ? `${sum.payments_today}, ${sum.mats_this_month} / ${sum.mats_all_time}` : r.err);
  r = await attempt('A', 'select * from public.admin_billing_summary()');
  const rGuest = await attempt('guest', 'select * from public.admin_billing_summary()');
  check('A client / a guest asks for the billing totals', 'both refused', !r.ok && !rGuest.ok, `${r.err} | ${rGuest.err}`);

  // ===========================================================================
  t.section('Starting a PayMongo checkout');
  // ===========================================================================
  r = await book('A', S[0], { mat: true });
  const a0 = r.row.booking_id;
  r = await start('A', a0);
  check('A starts paying their own hold', 'total 550, no checkout yet',
    r.ok && r.row.total === '550.00' && r.row.payment_id === null, r.ok ? `${r.row.total}, ${r.row.payment_id}` : r.err);
  r = await start('B', a0);
  check("B tries to pay A's booking", "refused (\"couldn't find\")", !r.ok && r.err.includes("couldn't find"), r.err);
  r = await start('admin', a0);
  const rg = await start('guest', a0);
  check("An admin / a guest uses the client's pay button", 'both refused', !r.ok && !rg.ok, `${r.err} | ${rg.err}`);

  const ref1 = newRef();
  r = await save('A', a0, 'gcash', ref1);
  const pay1 = r.row?.payment_id;
  let row = await paymentFor(ref1);
  check('A saves a GCash checkout', 'saved: pending, gcash, amount 550 (from the booking)',
    r.ok && r.row.saved && row?.status === 'pending' && row.method === 'gcash' && row.amount === '550.00',
    r.ok ? `${r.row.saved}, ${row?.status}, ${row?.method}, ${row?.amount}` : r.err);

  r = await save('A', a0, 'gcash', newRef());
  const pending = await q(`select id from public.payments where booking_id = $1 and status = 'pending'`, [a0]);
  check('A presses Pay twice (a second checkout comes in)', 'not saved: gives back the FIRST checkout, still 1 open',
    r.ok && !r.row.saved && r.row.paymongo_ref === ref1 && pending.length === 1,
    r.ok ? `saved ${r.row.saved}, ${r.row.paymongo_ref === ref1 ? 'first' : 'other'} ref, ${pending.length} open` : r.err);
  r = await start('A', a0);
  check('start_online_payment now finds the open checkout', 'ref1, gcash',
    r.ok && r.row.paymongo_ref === ref1 && r.row.method === 'gcash', r.ok ? `${r.row.method}` : r.err);

  const ref2 = newRef();
  r = await save('A', a0, 'maya', ref2, pay1);
  check('A switches to Maya (the old checkout is replaced)', 'saved; the GCash row becomes expired',
    r.ok && r.row.saved && (await paymentFor(ref1)).status === 'expired' && (await paymentFor(ref2)).method === 'maya',
    r.ok ? `${r.row.saved}, old ${(await paymentFor(ref1)).status}` : r.err);

  r = await save('A', a0, 'maya', 'not-a-paymongo-id');
  const rBpi = await save('A', a0, 'bpi', newRef());
  check('A sends a made-up checkout id / BPI as an online method', 'both refused', !r.ok && !rBpi.ok, `${r.err} | ${rBpi.err}`);
  r = await save('B', a0, 'gcash', newRef());
  check("B saves a checkout on A's booking", 'refused', !r.ok && r.err.includes("couldn't find"), r.err);

  // ===========================================================================
  t.section('Who may confirm a payment');
  // ===========================================================================
  for (const actor of ['A', 'admin', 'guest']) {
    r = await t.attempt(actor, 'select * from public.confirm_online_payment($1, $2, 550, $3, now())', [ref2, a0, 'maya']);
    check(`${actor === 'A' ? 'The client themself' : actor === 'admin' ? 'An admin' : 'A guest'} calls confirm_online_payment`,
      'refused (server key only)', !r.ok && r.err.includes('permission denied'), r.err);
  }
  check('Still waiting for payment after those tries', 'pending_payment', (await status(a0)) === 'pending_payment', await status(a0));

  // ===========================================================================
  t.section('Normal payment, and twice in a row');
  // ===========================================================================
  r = await confirm(a0, ref2, 550, 'maya');
  row = await paymentFor(ref2);
  check('The server confirms an on-time Maya payment', 'confirmed; payment paid, paid_at set, method maya',
    r.ok && r.row.outcome === 'confirmed' && (await status(a0)) === 'confirmed'
      && row.status === 'paid' && row.paid_at !== null && row.method === 'maya',
    r.ok ? `${r.row.outcome}, ${await status(a0)}, ${row.status}, ${row.method}` : r.err);
  const firstPaidAt = String(row.paid_at);
  r = await confirm(a0, ref2, 550, 'maya');
  row = await paymentFor(ref2);
  check('The same payment is confirmed again (webhook + return page)', 'already_paid, nothing changed',
    r.ok && r.row.outcome === 'already_paid' && String(row.paid_at) === firstPaidAt && (await status(a0)) === 'confirmed',
    r.ok ? r.row.outcome : r.err);
  const paidRows = await q(`select id from public.payments where booking_id = $1 and status = 'paid'`, [a0]);
  check('Paid payments on that booking', '1', paidRows.length === 1, paidRows.length);

  // A voucher is spent ONCE, even when the confirmation comes twice.
  await q(`insert into public.vouchers (code, percent_off, source, uses_left) values ('TWICE20', 20, 'promo', 2)`);
  r = await book('B', S[1], { code: 'TWICE20' });
  const b1 = r.row.booking_id;
  const refV = newRef();
  await save('B', b1, 'card', refV);
  await confirm(b1, refV, 400, 'card');
  await confirm(b1, refV, 400, 'card');
  const usesLeft = (await one(`select uses_left from public.vouchers where code = 'TWICE20'`)).uses_left;
  check('A 2-use code on a payment confirmed twice', '1 use left (spent once, by the trigger)', usesLeft === 1, usesLeft);

  // Two confirmations at the very same moment (two connections).
  r = await book('B', S[2]);
  const b2 = r.row.booking_id;
  const refRace = newRef();
  await save('B', b2, 'gcash', refRace);
  const [c1, c2] = [await t.connect(), await t.connect()];
  const both = await Promise.all([confirm(b2, refRace, 500, 'gcash', 'server', c1), confirm(b2, refRace, 500, 'gcash', 'server', c2)]);
  await c1.end();
  await c2.end();
  const outcomes = both.map((x) => (x.ok ? x.row.outcome : x.err)).sort();
  check('Webhook and return page confirm at the same moment', 'one confirmed, one already_paid',
    outcomes[0] === 'already_paid' && outcomes[1] === 'confirmed', outcomes.join(', '));

  // ===========================================================================
  t.section('Late payments (the hold had ended)');
  // ===========================================================================
  // Late, a seat is still free -> confirmed
  r = await book('A', S[3]);
  const late1 = r.row.booking_id;
  const refL1 = newRef();
  await save('A', late1, 'gcash', refL1);
  await endHold(late1);
  r = await confirm(late1, refL1, 500);
  check('Late, and a seat is still free', 'confirmed', r.ok && r.row.outcome === 'confirmed' && (await status(late1)) === 'confirmed',
    r.ok ? `${r.row.outcome}, ${await status(late1)}` : r.err);

  // Late, and someone else took the only seat -> paid_needs_action
  await q('update public.class_sessions set capacity = 1 where id = $1', [S[4]]);
  r = await book('A', S[4]);
  const late2 = r.row.booking_id;
  const refL2 = newRef();
  await save('A', late2, 'gcash', refL2);
  await endHold(late2);
  r = await book('B', S[4]);
  check('B takes the seat after A\'s hold ended', 'held', r.ok, r.ok ? 'held' : r.err);
  r = await confirm(late2, refL2, 500);
  check('Late, and the class is now full', 'paid_needs_action; payment paid; still 0 seats left (no overbooking)',
    r.ok && r.row.outcome === 'needs_action' && (await status(late2)) === 'paid_needs_action'
      && (await paymentFor(refL2)).status === 'paid' && (await seatsLeft(S[4])) === 0,
    r.ok ? `${r.row.outcome}, ${await status(late2)}, ${await seatsLeft(S[4])} left` : r.err);

  // Late, and the cafe cancelled the class -> paid_needs_action
  r = await book('A', S[5]);
  const late3 = r.row.booking_id;
  const refL3 = newRef();
  await save('A', late3, 'card', refL3);
  await endHold(late3);
  await q(`update public.class_sessions set status = 'cancelled' where id = $1`, [S[5]]);
  r = await confirm(late3, refL3, 500, 'card');
  check('Late, and the cafe cancelled the class', 'paid_needs_action', r.ok && (await status(late3)) === 'paid_needs_action',
    r.ok ? `${r.row.outcome}, ${await status(late3)}` : r.err);

  // "Change details" gave the hold up, A booked the class again, then the
  // OLD checkout got paid -> paid_needs_action (never two seats for A)
  r = await book('A', S[6]);
  const late4 = r.row.booking_id;
  const refL4 = newRef();
  await save('A', late4, 'gcash', refL4);
  await as('A', 'select public.release_my_hold($1)', [late4]);
  r = await book('A', S[6]);
  const again = r.row?.booking_id;
  r = await confirm(late4, refL4, 500);
  check('Old checkout paid after Change details + booking the class again', 'paid_needs_action; the new hold is untouched',
    r.ok && (await status(late4)) === 'paid_needs_action' && (await status(again)) === 'pending_payment',
    r.ok ? `${await status(late4)}, new ${await status(again)}` : r.err);

  // ===========================================================================
  t.section('Odd cases');
  // ===========================================================================
  // Paid the wrong amount (on time) -> paid_needs_action, the real amount recorded
  r = await book('A', S[7], { mat: true });
  const wrong = r.row.booking_id;
  const refW = newRef();
  await save('A', wrong, 'gcash', refW);
  r = await confirm(wrong, refW, 500);
  check('Paid 500 for a 550 booking', 'paid_needs_action; payment amount saved as 500',
    r.ok && (await status(wrong)) === 'paid_needs_action' && (await paymentFor(refW)).amount === '500.00',
    r.ok ? `${await status(wrong)}, ${(await paymentFor(refW)).amount}` : r.err);

  // The checkout was never saved (the save failed) -> the row is added, money never lost
  r = await book('B', S[8]);
  const unsaved = r.row.booking_id;
  const refU = newRef();
  r = await confirm(unsaved, refU, 500, 'card');
  check('A paid checkout we have no row for', 'row added as paid, booking confirmed',
    r.ok && (await paymentFor(refU))?.status === 'paid' && (await status(unsaved)) === 'confirmed',
    r.ok ? `${(await paymentFor(refU))?.status}, ${await status(unsaved)}` : r.err);

  // A checkout id used with the wrong booking -> refused
  r = await confirm(late1, refU, 500, 'card');
  check("A checkout confirmed for a different booking", 'refused', !r.ok && r.err.includes('different booking'), r.err);

  // A second, different payment for an already confirmed booking
  const refX = newRef();
  r = await confirm(a0, refX, 550, 'gcash');
  const paidNow = await q(`select id from public.payments where booking_id = $1 and status = 'paid'`, [a0]);
  check('A second payment for a booking that is already confirmed', 'extra_payment: booking stays confirmed, 2 paid payments',
    r.ok && r.row.outcome === 'extra_payment' && (await status(a0)) === 'confirmed' && paidNow.length === 2,
    r.ok ? `${r.row.outcome}, ${await status(a0)}, ${paidNow.length} paid` : r.err);

  // ===========================================================================
  t.section('Free (0-peso) bookings');
  // ===========================================================================
  await q(`insert into public.vouchers (code, percent_off, source, uses_left) values ('FREE100', 100, 'promo', 5)`);
  r = await book('B', S[9], { code: 'FREE100' });
  const free = r.row.booking_id;
  r = await start('B', free);
  check('Paying a 0-peso booking online', 'refused (nothing to pay)', !r.ok && r.err.includes('free'), r.err);
  r = await as('A', 'select public.confirm_free_booking($1) as s', [free]);
  check("A confirms B's free booking", 'refused', !r.ok, r.err);
  r = await as('B', 'select public.confirm_free_booking($1) as s', [free]);
  check('B confirms their own free booking', 'confirmed', r.ok && (await status(free)) === 'confirmed', r.ok ? await status(free) : r.err);
  r = await book('B', S[12]);
  r = await as('B', 'select public.confirm_free_booking($1) as s', [r.row.booking_id]);
  check('confirm_free_booking on a 500-peso booking', 'refused', !r.ok && r.err.includes("isn't free"), r.err);

  // ===========================================================================
  t.section('Manual transfer: screenshot storage');
  // ===========================================================================
  const A = users.A;
  const B = users.B;
  const upload = (actor, name) =>
    as(actor, `insert into storage.objects (bucket_id, name) values ('payment-screenshots', $1) returning id`, [name]);
  const pathA = `${A}/${crypto.randomUUID()}-1.png`;
  r = await upload('A', pathA);
  check('A uploads into their own folder', 'allowed', r.ok, r.ok ? 'allowed' : r.err);
  r = await upload('B', `${A}/sneaky.png`);
  const rRoot = await upload('A', 'loose.png');
  const rGuestUp = await upload('guest', `${A}/guest.png`);
  check("B uploads into A's folder / A outside any folder / a guest", 'all refused',
    !r.ok && !rRoot.ok && !rGuestUp.ok, `${r.err} | ${rRoot.err} | ${rGuestUp.err}`);
  const pathB = `${B}/${crypto.randomUUID()}-1.png`;
  await upload('B', pathB);
  // The screenshot file names someone can see (RLS decides)
  const see = async (actor) =>
    (await attempt(actor, `select name from storage.objects where bucket_id = 'payment-screenshots'`)).rows?.map((x) => x.name) ?? [];
  const seenA = await see('A');
  const seenAdmin = await see('admin');
  check('A lists the screenshot bucket', "only A's own file", seenA.length === 1 && seenA[0] === pathA, seenA.join(', '));
  check('An admin lists the screenshot bucket', "both clients' files", seenAdmin.includes(pathA) && seenAdmin.includes(pathB), seenAdmin.length);
  r = await attempt('A', `delete from storage.objects where name = $1 returning id`, [pathA]);
  const rUpd = await attempt('A', `update storage.objects set name = name where name = $1 returning id`, [pathA]);
  check('A deletes / replaces their uploaded screenshot', 'nothing happens (0 rows)',
    r.ok && r.rows.length === 0 && rUpd.ok && rUpd.rows.length === 0, `${r.rows?.length ?? r.err} / ${rUpd.rows?.length ?? rUpd.err}`);

  // ===========================================================================
  t.section('Manual transfer: submit_manual_payment');
  // ===========================================================================
  const submit = (actor, bookingId, method, path) =>
    as(actor, 'select public.submit_manual_payment($1, $2, $3) as s', [bookingId, method, path]);
  r = await book('A', S[13], { mat: true });
  const man = r.row.booking_id;
  const refM = newRef();
  await save('A', man, 'gcash', refM); // A opened PayMongo first, then switched to a transfer

  r = await submit('B', man, 'gcash', pathB);
  check("B submits a transfer for A's booking", "refused (\"couldn't find\")", !r.ok && r.err.includes("couldn't find"), r.err);
  r = await submit('A', man, 'gcash', pathB);
  check("A submits with B's screenshot", 'refused (screenshot)', !r.ok && r.err.includes('screenshot'), r.err);
  r = await submit('A', man, 'gcash', `${A}/never-uploaded.png`);
  check('A submits a screenshot that was never uploaded', 'refused (screenshot)', !r.ok && r.err.includes('screenshot'), r.err);
  r = await submit('A', man, 'maya', pathA);
  check('A picks Maya for a manual transfer', 'refused (GCash or BPI)', !r.ok && r.err.includes('GCash or BPI'), r.err);
  await q(`update public.settings set value = 'false' where key = 'manual_payment_enabled'`);
  r = await submit('A', man, 'gcash', pathA);
  await q(`update public.settings set value = 'true' where key = 'manual_payment_enabled'`);
  check('Manual transfers turned off by the admin', 'refused', !r.ok && r.err.includes('turned off'), r.err);

  r = await submit('A', man, 'bpi', pathA);
  const manual = await one(`select * from public.payments where booking_id = $1 and provider = 'manual'`, [man]);
  check('A submits a BPI transfer with their screenshot', 'awaiting_verification; manual pending payment of 550 with the screenshot',
    r.ok && (await status(man)) === 'awaiting_verification' && manual?.status === 'pending'
      && manual.amount === '550.00' && manual.screenshot_path === pathA,
    r.ok ? `${await status(man)}, ${manual?.status}, ${manual?.amount}` : r.err);
  check('The PayMongo checkout opened before', 'expired', (await paymentFor(refM)).status === 'expired', (await paymentFor(refM)).status);
  check('The seat stays held while the cafe checks', '3 seats left', (await seatsLeft(S[13])) === 3, await seatsLeft(S[13]));
  r = await submit('A', man, 'bpi', pathA);
  check('A submits again', 'refused (no longer waiting for payment)', !r.ok && r.err.includes('no longer waiting'), r.err);

  r = await book('A', S[14]);
  const manLate = r.row.booking_id;
  await endHold(manLate);
  r = await submit('A', manLate, 'gcash', pathA);
  check('A submits after the hold ended', 'refused (hold ended)', !r.ok && r.err.includes('hold has ended'), r.err);

  r = await as('admin', 'select public.admin_review_manual_payment($1, true) as s', [manual.id]);
  check('The admin approves the transfer', 'confirmed', r.ok && (await status(man)) === 'confirmed', r.ok ? await status(man) : r.err);

  // ===========================================================================
  t.section('Billings after all of the above');
  // ===========================================================================
  r = await attempt('admin', 'select * from public.admin_billing_summary()');
  const lateCount = (await one(`select count(*)::integer as n from public.bookings where status = 'paid_needs_action'`)).n;
  check('Admin: "paid, needs action" count', `${lateCount} (late full, cancelled, Change details, wrong amount)`,
    r.ok && r.row.paid_needs_action === lateCount && lateCount === 4, r.ok ? r.row.paid_needs_action : r.err);
}
