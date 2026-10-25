// Tests for migration 18 (..._v14_admin.sql), Revisions "Version 1.4" admin part 1:
//   - an UNPAID booking can't be marked attended or no-show
//   - a paid one can (PayMongo, approved screenshot, cash), and so can a
//     booking whose payment sits on the booking it was transferred from
//   - pending / rejected / refunded payments don't count as paid
//   - a booking in a class the cafe cancelled can't be marked
//   - admin_get_booking's can_mark_attendance says the same thing
//   - booking_has_paid_payment() is private (the website can't call it)
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.4 admin: attendance only for paid bookings';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, as, attempt, status, sessionIn, confirmedBooking } = t;
  for (const key of ['A', 'B', 'C', 'D', 'E']) await t.addUser(key);
  await t.addUser('admin', { admin: true });

  // Marks a booking attended as the admin (kept if it works).
  // Takes: the booking id. Gives back: the as() result.
  const markAttended = (bookingId) =>
    as('admin', "select public.admin_set_attendance($1, 'attended') as s", [bookingId]);
  // What the booking details page would be told.
  // Takes: the booking id. Gives back: true / false (or undefined if no row).
  const canMark = async (bookingId) =>
    (await attempt('admin', 'select can_mark_attendance from public.admin_get_booking($1)', [bookingId])).row
      ?.can_mark_attendance;

  // A class that started 2 hours ago (so attendance may be marked today)
  const earlier = await sessionIn(-2);

  // ===========================================================================
  t.section('Unpaid bookings');
  // ===========================================================================
  const unpaid = await confirmedBooking(earlier, 'A');
  let r = await markAttended(unpaid);
  check('Unpaid booking can\'t be marked attended', 'refused, says no paid payment',
    !r.ok && /no paid payment/.test(r.err), r.err ?? 'ALLOWED');
  check('Its status', 'still confirmed', (await status(unpaid)) === 'confirmed', await status(unpaid));
  r = await attempt('admin', "select public.admin_set_attendance($1, 'no_show')", [unpaid]);
  check('Unpaid booking marked no-show', 'refused too', !r.ok && /no paid payment/.test(r.err), r.err ?? 'ALLOWED');
  check('admin_get_booking for the unpaid booking', 'can_mark_attendance = false', (await canMark(unpaid)) === false,
    String(await canMark(unpaid)));

  // Payments that are NOT paid don't count
  for (const bad of ['pending', 'rejected', 'refunded']) {
    await q(`delete from public.payments where booking_id = $1`, [unpaid]);
    await q(`insert into public.payments (booking_id, provider, method, amount, status, paid_at)
             values ($1, 'manual', 'gcash', 550, $2::public.payment_status,
                     case when $2::text = 'refunded' then now() end)`, [unpaid, bad]);
    r = await markAttended(unpaid);
    check(`Booking with only a ${bad} payment`, 'refused', !r.ok && /no paid payment/.test(r.err), r.err ?? 'ALLOWED');
  }

  // ===========================================================================
  t.section('Paid bookings');
  // ===========================================================================
  // The same booking, now with a paid payment
  await q(`delete from public.payments where booking_id = $1`, [unpaid]);
  await t.pay(unpaid);
  check('admin_get_booking once paid', 'can_mark_attendance = true', (await canMark(unpaid)) === true, String(await canMark(unpaid)));
  r = await markAttended(unpaid);
  check('Paid booking marked attended', 'attended', r.ok && (await status(unpaid)) === 'attended', r.err ?? await status(unpaid));
  r = await as('admin', "select public.admin_set_attendance($1, 'no_show')", [unpaid]);
  check('Fix a mistake: attended -> no-show', 'no_show', r.ok && (await status(unpaid)) === 'no_show', r.err ?? await status(unpaid));

  // A walk-in (cash recorded by admin_walkin_booking) is paid. Walk-ins can
  // only join a class that hasn't ended, so use one that started 30 minutes ago.
  const walk = (await as('admin', `select booking_id from public.admin_walkin_booking($1, 'Walk-in Wes', '0917', 'cash', true, true)`,
    [await sessionIn(-0.5)])).row?.booking_id;
  r = await markAttended(walk);
  check('Walk-in paid in cash', 'attended', r.ok && (await status(walk)) === 'attended', r.err ?? await status(walk));

  // Paid, then transferred: the payment stays on the ORIGINAL booking
  const original = await confirmedBooking(earlier, 'B');
  await t.pay(original);
  const moved = await confirmedBooking(earlier, 'C');
  await q(`update public.bookings set status = 'transferred' where id = $1`, [original]);
  await q(`update public.bookings set transferred_from = $1 where id = $2`, [original, moved]);
  check('Transferred booking (paid on the original)', 'can_mark_attendance = true', (await canMark(moved)) === true,
    String(await canMark(moved)));
  r = await markAttended(moved);
  check('Mark it attended', 'attended', r.ok && (await status(moved)) === 'attended', r.err ?? await status(moved));

  // The class-day rule still applies to paid bookings
  const tomorrow = await confirmedBooking(await sessionIn(30), 'D');
  await t.pay(tomorrow);
  r = await markAttended(tomorrow);
  check('Paid booking for a class tomorrow', 'refused (class day)', !r.ok && /class day/.test(r.err), r.err ?? 'ALLOWED');
  check('admin_get_booking for it', 'can_mark_attendance = false', (await canMark(tomorrow)) === false, String(await canMark(tomorrow)));

  // ===========================================================================
  t.section('Class cancelled by the cafe');
  // ===========================================================================
  const cancelledClass = await sessionIn(-1);
  const inCancelled = await confirmedBooking(cancelledClass, 'E');
  await t.pay(inCancelled);
  await as('admin', 'select public.admin_cancel_session($1)', [cancelledClass]);
  r = await markAttended(inCancelled);
  check('Paid booking in a cancelled class', 'refused (class cancelled)', !r.ok && /cancelled this class/.test(r.err), r.err ?? 'ALLOWED');
  check('admin_get_booking for it', 'can_mark_attendance = false', (await canMark(inCancelled)) === false,
    String(await canMark(inCancelled)));
  check('Its status', 'still confirmed (free transfer for the client)', (await status(inCancelled)) === 'confirmed',
    await status(inCancelled));

  // ===========================================================================
  t.section('The helper is private');
  // ===========================================================================
  for (const actor of ['guest', 'A', 'admin']) {
    r = await attempt(actor, 'select public.booking_has_paid_payment($1)', [unpaid]);
    check(`${actor} calls booking_has_paid_payment directly`, 'refused', !r.ok, r.err ?? 'ALLOWED');
  }
}
