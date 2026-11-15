// Tests for migration 23 (..._v16_client.sql), Version 1.6 client side.
//   - Age 18+: a new or changed birthday under 18 (Philippine date) is
//     refused by the database, on My Profile, sign-up and admin Edit user;
//     exactly 18 today is allowed; an old under-18 row still saves when
//     only other details change
//   - Class cancelled by the cafe: unpaid holds are released (expired, seat
//     free, "not charged" update) and ONLY those; awaiting_verification
//     stays (with its own update), confirmed keeps the free move; once a
//     cancelled-class transfer is approved, the free move is offered
//   - Payment rejected: get_my_bookings() lists the rejected booking with
//     payment_rejected = true, get_my_rejected_session_booking() finds it,
//     and both stop once the client books that class again. The seat stays
//     held while the cafe checks (seat counting unchanged)
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.6: age 18+, class cancelled by the cafe, payment rejected';

// The message the database (and website) shows for an under-18 birthday.
const AGE = /at least 18 years old/;

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, attempt, sessionIn } = t;
  for (const key of ['A', 'B', 'C', 'D', 'E']) await t.addUser(key);
  await t.addUser('admin', { admin: true });

  // A date N years (and D days) before today's Philippine date, as "YYYY-MM-DD".
  async function yearsAgo(years, days = 0) {
    return (await one(
      `select ((now() at time zone 'Asia/Manila')::date - make_interval(years => $1) + make_interval(days => $2))::date::text as d`,
      [years, days])).d;
  }
  // One profile's birthday as "YYYY-MM-DD" (or null).
  const birthday = async (key) =>
    (await one(`select birthday::text as b from public.profiles where id = $1`, [t.users[key]])).b;

  // ===========================================================================
  t.section('Age 18+ (birthday)');
  // ===========================================================================
  const under18 = await yearsAgo(17);        // 17 years old today
  const almost18 = await yearsAgo(18, 1);    // turns 18 tomorrow
  const exactly18 = await yearsAgo(18);      // turns 18 today
  let r = await attempt('A', `update public.profiles set birthday = $1 where id = auth.uid()`, [under18]);
  check('Client sets a birthday 17 years ago (My Profile)', 'refused with the 18+ message', !r.ok && AGE.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('A', `update public.profiles set birthday = $1 where id = auth.uid()`, [almost18]);
  check('Client who turns 18 tomorrow', 'refused', !r.ok && AGE.test(r.err), r.err ?? 'ALLOWED');
  r = await as('A', `update public.profiles set birthday = $1 where id = auth.uid()`, [exactly18]);
  check('Client who turns 18 today', 'allowed', r.ok && (await birthday('A')) === exactly18, r.err ?? (await birthday('A')));
  r = await attempt('A', `update public.profiles set birthday = (now() + interval '3 days')::date where id = auth.uid()`);
  check('Client sets a birthday in the future', 'refused', !r.ok, r.err ?? 'ALLOWED');

  // Sign-up: the birthday comes from the sign-up form's metadata
  let signupErr = null;
  try {
    await t.db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'kid@test.example', $1)`,
      [{ full_name: 'Too Young', mobile: '09171234567', birthday: under18 }]);
  } catch (e) {
    signupErr = e.message;
  }
  check('Sign-up with a birthday 17 years ago', 'refused with the 18+ message', AGE.test(signupErr ?? ''), signupErr ?? 'ALLOWED');
  const adultId = (await one(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'adult@test.example', $1) returning id`,
    [{ full_name: 'Grown Up', mobile: '09171234567', birthday: '1995-06-15' }])).id;
  const adult = await one(`select birthday::text as b from public.profiles where id = $1`, [adultId]);
  check('Sign-up with an adult birthday', 'saved', adult?.b === '1995-06-15', adult?.b);
  const google = (await one(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'g@test.example', $1) returning id`,
    [{ full_name: 'Google Person' }])).id;
  check('Google sign-up (no birthday yet)', 'allowed, birthday empty',
    (await one(`select birthday from public.profiles where id = $1`, [google])).birthday === null, 'has a birthday');

  // Admin Edit user
  await t.db.query(`update public.profiles set mobile = '09171234567', birthday = '1990-01-01' where id = $1`, [t.users.B]);
  r = await attempt('admin', `select public.admin_update_user($1, 'Test B', '09171234567', '', $2)`, [t.users.B, under18]);
  check('Admin Edit user: birthday 17 years ago', 'refused with the 18+ message', !r.ok && AGE.test(r.err), r.err ?? 'ALLOWED');
  r = await as('admin', `select public.admin_update_user($1, 'Test B', '09171234567', '', '1990-02-02')`, [t.users.B]);
  check('Admin Edit user: adult birthday', 'allowed', r.ok && (await birthday('B')) === '1990-02-02', r.err);

  // An OLD row saved before this rule (trigger off for a moment, like data
  // from before the migration)
  await t.db.query(`alter table public.profiles disable trigger profiles_zz_check_birthday_age`);
  await t.db.query(`update public.profiles set birthday = $1, mobile = '09171234567' where id = $2`, [under18, t.users.C]);
  await t.db.query(`alter table public.profiles enable trigger profiles_zz_check_birthday_age`);
  r = await as('C', `update public.profiles set mobile = '09181234567' where id = auth.uid()`);
  check('Old under-18 row: client changes only the mobile', 'allowed (old rows don\'t break)', r.ok, r.err);
  r = await as('admin', `select public.admin_update_user($1, 'Test C renamed', '09181234567', '', $2)`, [t.users.C, under18]);
  check('Old under-18 row: admin renames, same birthday', 'allowed', r.ok, r.err);

  // ===========================================================================
  t.section('Class cancelled by the cafe');
  // ===========================================================================
  const cls = await sessionIn(72);
  // A: an unpaid hold that is still running
  r = await t.book('A', cls);
  const holdA = r.row?.booking_id;
  // B: a GCash screenshot waiting to be checked
  const waitB = (await one(`
    insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                                 not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'awaiting_verification', false, 'Iced Matcha', 500, 0, 500, true, now()) returning id`,
  [cls, t.users.B])).id;
  const payB = (await one(`
    insert into public.payments (booking_id, provider, method, amount, status, screenshot_path)
    values ($1, 'manual', 'gcash', 500, 'pending', 'test/b.png') returning id`, [waitB])).id;
  // C: paid and confirmed
  const paidC = await t.confirmedBooking(cls, 'C');
  await t.pay(paidC);
  // D: an unpaid hold whose 15 minutes already ran out
  r = await t.book('D', cls);
  const lapsedD = r.row?.booking_id;
  await t.db.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [lapsedD]);

  check('Before cancelling', '1 seat left (A hold, B checking, C paid; D lapsed)', (await t.seatsLeft(cls)) === 1, await t.seatsLeft(cls));

  r = await as('admin', `select public.admin_cancel_session($1) as n`, [cls]);
  check('Admin cancels the class', 'done; 2 bookings still hold a seat (B and C)', r.ok && r.row?.n === 2, r.err ?? r.row?.n);
  check('A\'s running unpaid hold', 'released (expired)', (await t.status(holdA)) === 'expired', await t.status(holdA));
  check('D\'s lapsed unpaid hold', 'expired', (await t.status(lapsedD)) === 'expired', await t.status(lapsedD));
  check('B\'s transfer being checked', 'still awaiting_verification', (await t.status(waitB)) === 'awaiting_verification', await t.status(waitB));
  check('C\'s paid booking', 'still confirmed', (await t.status(paidC)) === 'confirmed', await t.status(paidC));

  // The updates in each client's bell
  const kinds = async (key) => (await t.q(`select kind::text from public.notifications where user_id = $1 order by created_at`,
    [t.users[key]])).map((x) => x.kind);
  check('A\'s update', '"hold released, not charged" only', JSON.stringify(await kinds('A')) === '["class_cancelled_hold_released"]',
    (await kinds('A')).join(','));
  check('B\'s update', '"still checking your payment"', (await kinds('B')).includes('class_cancelled_checking') &&
    !(await kinds('B')).includes('class_cancelled'), (await kinds('B')).join(','));
  check('C\'s update', '"class cancelled, move for free"', (await kinds('C')).includes('class_cancelled'), (await kinds('C')).join(','));
  check('D (hold already over)', 'no update', (await kinds('D')).length === 0, (await kinds('D')).join(','));

  // My Bookings
  r = await as('A', `select * from public.get_my_bookings()`);
  check('A\'s My Bookings', 'the released hold is gone (no "Pay now")', r.ok && !r.rows.some((x) => x.booking_id === holdA),
    r.err ?? r.rows.map((x) => x.status).join(','));
  r = await as('B', `select * from public.get_my_bookings()`);
  const rowB = r.rows?.find((x) => x.booking_id === waitB);
  check('B\'s My Bookings', 'awaiting_verification, class cancelled, upcoming',
    rowB?.status === 'awaiting_verification' && rowB?.session_status === 'cancelled' && rowB?.is_upcoming === true,
    JSON.stringify(rowB && [rowB.status, rowB.session_status, rowB.is_upcoming]));

  // The admin approves B's screenshot: the free move is offered
  r = await as('admin', `select public.admin_review_manual_payment($1, true) as s`, [payB]);
  check('Admin approves B\'s transfer', 'confirmed', r.ok && r.row?.s === 'confirmed', r.err ?? r.row?.s);
  r = await as('B', `select * from public.get_my_bookings()`);
  const approvedB = r.rows?.find((x) => x.booking_id === waitB);
  check('B after approval', 'free move offered (free_transfer, can_transfer)',
    approvedB?.change_rule === 'free_transfer' && approvedB?.can_transfer === true,
    JSON.stringify(approvedB && [approvedB.change_rule, approvedB.can_transfer]));

  // Walk-in holds (no account) are released too, with no update
  const cls2 = await sessionIn(80);
  const walkHold = (await one(`
    insert into public.bookings (session_id, walkin_name, walkin_contact, status, mat_rental, class_fee, mat_fee, total,
                                 not_pregnant_confirmed, agreed_at, hold_expires_at)
    values ($1, 'Walk In', '09171234567', 'pending_payment', false, 500, 0, 500, true, now(), now() + interval '10 minutes')
    returning id`, [cls2])).id;
  await t.db.query(`update public.class_sessions set status = 'cancelled' where id = $1`, [cls2]);
  check('A walk-in\'s unpaid hold (class cancelled by a plain update)', 'expired', (await t.status(walkHold)) === 'expired',
    await t.status(walkHold));

  // ===========================================================================
  t.section('Payment rejected');
  // ===========================================================================
  const cls3 = await sessionIn(96);
  const waitE = (await one(`
    insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice, class_fee, mat_fee, total,
                                 not_pregnant_confirmed, agreed_at)
    values ($1, $2, 'awaiting_verification', true, 'Iced Matcha', 500, 50, 550, true, now()) returning id`,
  [cls3, t.users.E])).id;
  const payE = (await one(`
    insert into public.payments (booking_id, provider, method, amount, status, screenshot_path)
    values ($1, 'manual', 'bpi', 550, 'pending', 'test/e.png') returning id`, [waitE])).id;
  check('While the cafe checks', 'the seat stays held (3 of 4 left)', (await t.seatsLeft(cls3)) === 3, await t.seatsLeft(cls3));
  r = await as('E', `select public.get_my_rejected_session_booking($1) as id`, [cls3]);
  check('Step 2 before any decision', 'no rejected booking', r.ok && r.row?.id === null, r.err ?? r.row?.id);

  r = await as('admin', `select public.admin_review_manual_payment($1, false) as s`, [payE]);
  check('Admin rejects E\'s screenshot', 'expired, seat free again', r.ok && r.row?.s === 'expired' && (await t.seatsLeft(cls3)) === 4,
    r.err ?? r.row?.s);
  r = await as('E', `select * from public.get_my_bookings()`);
  const rowE = r.rows?.find((x) => x.booking_id === waitE);
  check('E\'s My Bookings', 'listed as payment_rejected, upcoming', rowE?.payment_rejected === true && rowE?.is_upcoming === true,
    JSON.stringify(rowE && [rowE.status, rowE.payment_rejected, rowE.is_upcoming]) ?? 'not listed');
  check('Other bookings', 'payment_rejected = false', r.rows?.filter((x) => x.booking_id !== waitE).every((x) => x.payment_rejected === false),
    'some true');
  r = await as('E', `select public.get_my_rejected_session_booking($1) as id`, [cls3]);
  check('Step 2 after the rejection', 'finds the rejected booking', r.row?.id === waitE, r.err ?? r.row?.id);
  r = await as('A', `select public.get_my_rejected_session_booking($1) as id`, [cls3]);
  check('Someone else asks about that class', 'nothing (own bookings only)', r.ok && r.row?.id === null, r.err ?? r.row?.id);

  // E books the class again
  r = await t.book('E', cls3);
  check('E books the same class again', 'allowed', r.ok, r.err);
  r = await as('E', `select * from public.get_my_bookings()`);
  check('E\'s My Bookings after booking again', 'the old rejected card is gone', !r.rows?.some((x) => x.booking_id === waitE),
    r.rows?.map((x) => x.status).join(','));
  r = await as('E', `select public.get_my_rejected_session_booking($1) as id`, [cls3]);
  check('Step 2 after booking again', 'no rejected booking', r.row?.id === null, r.row?.id);

  r = await attempt('guest', `select public.get_my_rejected_session_booking($1)`, [cls3]);
  check('A guest calls get_my_rejected_session_booking', 'refused', !r.ok, r.err ?? 'ALLOWED');
}
