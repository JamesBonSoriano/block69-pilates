// Tests for booking a seat (migration 3: book_seat, seats_left,
// get_open_sessions, generate_sessions, vouchers). The most important one is
// the overbooking test: 5 people try to book a 4-seat class at the SAME moment.
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Booking: classes, no overbooking, holds, cutoff, prices, vouchers';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, book, seatsLeft, status } = t;
  for (const key of ['A', 'B', 'C', 'D', 'E']) await t.addUser(key);
  await t.addUser('admin', { admin: true });

  // ===========================================================================
  t.section('Creating classes (generate_sessions)');
  // ===========================================================================
  let r = await as('A', 'select public.generate_sessions(4) as n');
  check('Client calls generate_sessions', 'refused', !r.ok, r.err);
  r = await as('guest', 'select public.generate_sessions(4) as n');
  check('Guest calls generate_sessions', 'refused', !r.ok, r.err);
  r = await as('admin', 'select public.generate_sessions(4) as n');
  check('Admin runs it again (migration 4 already made 4 weeks)', '0 created', r.ok && r.row.n === 0, r.ok ? `${r.row.n} created` : r.err);
  r = await as('admin', 'select public.generate_sessions(5) as n');
  check('Admin asks for 5 weeks', '8 created (1 more week x Thu-Sun x 2)', r.ok && r.row.n === 8, r.ok ? `${r.row.n} created` : r.err);
  r = await as('server', 'select public.generate_sessions(4) as n');
  check('Server key / nightly job can run it', 'allowed', r.ok, r.ok ? `allowed, ${r.row.n} created` : r.err);
  r = await as('admin', 'select public.generate_sessions(13) as n');
  check('Admin asks for 13 weeks', 'refused (1 to 12 only)', !r.ok, r.err);

  // Empty generated classes at least 3 days away, used by the tests below.
  const S = await t.emptySessions(3);

  // ===========================================================================
  t.section('No overbooking: 5 people, 4 seats, all at the same moment');
  // ===========================================================================
  // Each person gets their OWN database connection, like 5 phones clicking Pay.
  const people = ['A', 'B', 'C', 'D', 'E'];
  const conns = await Promise.all(people.map(() => t.connect()));
  // Everyone opens a transaction and logs in first...
  await Promise.all(conns.map(async (c, i) => { await c.query('begin'); await t.setActor(c, people[i]); }));
  // ...then all 5 call book_seat at once. Each one keeps its transaction open
  // for 0.3 seconds after booking, so the others really have to wait in line
  // for the row lock (select ... for update) before they can count seats.
  const t0 = Date.now();
  const race = await Promise.all(conns.map(async (c) => {
    try {
      const res = await c.query('select * from public.book_seat(p_session_id => $1, p_not_pregnant => true, p_agreed => true)', [S[0]]);
      const waited = Date.now() - t0;
      await c.query('select pg_sleep(0.3)');
      await c.query('commit');
      return { ok: true, waited, id: res.rows[0].booking_id };
    } catch (e) {
      await c.query('rollback');
      return { ok: false, waited: Date.now() - t0, err: e.message };
    }
  }));
  await Promise.all(conns.map((c) => c.end()));

  const winners = race.filter((x) => x.ok);
  const losers = race.filter((x) => !x.ok).map((x) => x.err);
  check('5 people book a 4-seat class at once', '4 succeed, 1 refused',
    winners.length === 4 && losers.length === 1, `${winners.length} succeeded, ${losers.length} refused`);
  check('What the 5th person sees', 'Sorry, this class is full.', losers[0] === 'Sorry, this class is full.', losers[0]);
  const slowest = Math.max(...race.map((x) => x.waited));
  check('They really waited in line (row lock)', 'slowest waited >= 1.2s (4 x 0.3s)', slowest >= 1200, `slowest waited ${slowest} ms`);
  const saved = await one('select count(*)::int as n from public.bookings where session_id = $1', [S[0]]);
  check('Bookings saved in the database', '4', saved.n === 4, saved.n);
  check('Seats left afterwards (as a guest)', '0', (await seatsLeft(S[0])) === 0, await seatsLeft(S[0]));
  r = await t.attempt('guest', 'select state, is_bookable from public.get_open_sessions() where session_id = $1', [S[0]]);
  check('get_open_sessions shows it as full', "state 'full', not bookable", r.ok && r.row.state === 'full' && r.row.is_bookable === false,
    r.ok ? `${r.row.state}, bookable = ${r.row.is_bookable}` : r.err);
  const winner = people[race.findIndex((x) => x.ok)];
  await q(`update public.class_sessions set capacity = 5 where id = $1`, [S[0]]);
  r = await book(winner, S[0]);
  check('The same person books the same class twice (seat free)', 'refused', !r.ok, r.err);
  await q(`update public.class_sessions set capacity = 4 where id = $1`, [S[0]]);

  // ===========================================================================
  t.section('15-minute seat hold');
  // ===========================================================================
  await q('update public.class_sessions set capacity = 1 where id = $1', [S[1]]);
  r = await book('A', S[1], { mat: true });
  const holdMin = r.ok ? (new Date(r.row.hold_expires_at) - Date.now()) / 60000 : 0;
  check('A books the only seat', 'pending_payment, held ~15 min', r.ok && holdMin > 14.9 && holdMin <= 15,
    r.ok ? `${await status(r.row.booking_id)}, held ${holdMin.toFixed(2)} min` : r.err);
  const aHold = r.row?.booking_id;
  r = await book('B', S[1]);
  check("B tries while A's hold is live", 'Sorry, this class is full.', !r.ok && r.err === 'Sorry, this class is full.', r.err);
  // Pretend 15 minutes passed: move A's hold end into the past. No timer is
  // needed: an ended hold simply stops counting.
  await q("update public.bookings set hold_expires_at = now() - interval '1 second' where id = $1", [aHold]);
  check('Seats left after the hold ends', '1', (await seatsLeft(S[1])) === 1, await seatsLeft(S[1]));
  r = await book('B', S[1]);
  check("B books after A's hold ended", 'succeeds', r.ok, r.ok ? 'succeeded' : r.err);

  // ===========================================================================
  t.section('Booking cutoff (8:00 AM on class day)');
  // ===========================================================================
  r = await t.attempt('guest', `select to_char(booking_closes_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') as closes,
                                       to_char(date, 'YYYY-MM-DD') as d from public.get_open_sessions() where session_id = $1`, [S[2]]);
  check('Default cutoff = 8:00 AM Manila on class day', `${r.row.d} 08:00`, r.row.closes === `${r.row.d} 08:00`, r.row.closes);
  // This part needs a class later TODAY (Manila time), so skip it right around midnight.
  const nowMin = (await one(`select (extract(hour from now() at time zone 'Asia/Manila') * 60
                                     + extract(minute from now() at time zone 'Asia/Manila'))::int as m`)).m;
  if (nowMin >= 5 && nowMin <= 23 * 60 + 40) {
    const today = await t.sessionIn(10 / 60); // starts in 10 minutes
    // Set the cutoff to 1 minute ago.
    await q(`update public.settings set value = to_jsonb(to_char((now() - interval '1 minute') at time zone 'Asia/Manila', 'HH24:MI')) where key = 'cutoff_time'`);
    r = await book('C', today);
    check('Book after the cutoff (cutoff was 1 min ago)', 'refused', !r.ok && r.err.startsWith('Sorry, online booking for this class closed at'), r.err);
    r = await t.attempt('guest', 'select state from public.get_open_sessions() where session_id = $1', [today]);
    check('get_open_sessions after the cutoff', "state 'booking_closed'", r.row?.state === 'booking_closed', r.row?.state);
    // Set the cutoff to 3 minutes from now.
    await q(`update public.settings set value = to_jsonb(to_char((now() + interval '3 minutes') at time zone 'Asia/Manila', 'HH24:MI')) where key = 'cutoff_time'`);
    r = await book('C', today);
    check('Book before the cutoff (cutoff in 3 min)', 'succeeds', r.ok, r.ok ? 'succeeded' : r.err);
    await q(`update public.settings set value = '"08:00"' where key = 'cutoff_time'`);
  } else {
    check('Book after the cutoff', 'refused', true, 'SKIPPED (too close to midnight in Manila, run again later)');
  }

  // ===========================================================================
  t.section('Prices come from settings, never from the browser');
  // ===========================================================================
  r = await book('D', S[3], { mat: true });
  check('Book with mat rental (default prices)', 'class 500 + mat 50 = 550',
    r.ok && r.row.class_fee === '500.00' && r.row.mat_fee === '50.00' && r.row.total === '550.00', r.ok ? money(r.row) : r.err);
  await q(`update public.settings set value = '650' where key = 'class_price'`);
  r = await book('E', S[3]);
  check('Admin changes the price to 650, then E books', 'class fee 650.00', r.ok && r.row.class_fee === '650.00', r.ok ? money(r.row) : r.err);
  await q(`update public.settings set value = '500' where key = 'class_price'`);
  r = await t.attempt('A', `select * from public.book_seat(p_session_id => $1, p_not_pregnant => false, p_agreed => true)`, [S[3]]);
  check('Book without the not-pregnant tick', 'refused', !r.ok && r.err.includes('pregnan'), r.err);
  r = await t.attempt('A', `select * from public.book_seat(p_session_id => $1, p_not_pregnant => true, p_agreed => false)`, [S[3]]);
  check('Book without ticking the Registration Agreement', 'refused', !r.ok && r.err.includes('Agreement'), r.err);
  r = await book('A', S[3], { drink: 'Milk Tea' });
  check('Drink that is not in the settings list', 'refused', !r.ok && r.err.includes('drink'), r.err);
  r = await t.attempt('guest', `select * from public.book_seat(p_session_id => $1, p_not_pregnant => true, p_agreed => true)`, [S[3]]);
  check('Guest (not logged in) tries to book', 'refused', !r.ok, r.err);

  // ===========================================================================
  t.section('Vouchers (class fee only, never the mat)');
  // ===========================================================================
  await q(`
    insert into public.vouchers (code, percent_off, amount_off, owner_id, source, uses_left, expires_at) values
      ('FULL100', 100, null, null, 'promo', 10, null),
      ('BIG600', null, 600, null, 'promo', 10, null),
      ('PCT50', 50, null, null, 'promo', 10, null),
      ('ONEUSE', 20, null, null, 'promo', 1, null),
      ('OLDCODE', 10, null, null, 'promo', 10, now() - interval '1 day'),
      ('HALF-AAAAAA', 50, null, $1, 'cancellation', 1, now() + interval '60 days')`, [t.users.A]);
  r = await book('A', S[4], { mat: true, code: 'FULL100' });
  check('100% code + mat rental', 'total 50.00 (mat not discounted)', r.ok && r.row.total === '50.00' && r.row.mat_fee === '50.00', r.ok ? money(r.row) : r.err);
  r = await book('B', S[4], { mat: true, code: 'BIG600' });
  check('600-peso code + mat rental', 'discount capped at 500, total 50.00', r.ok && r.row.discount === '500.00' && r.row.total === '50.00', r.ok ? money(r.row) : r.err);
  r = await book('C', S[4], { mat: true, code: ' pct50 ' });
  check('50% code typed as " pct50 " + mat', 'total 300.00', r.ok && r.row.total === '300.00', r.ok ? money(r.row) : r.err);
  r = await t.attempt('D', "select * from public.check_voucher('PCT50')");
  check('check_voucher preview ("Apply" button)', 'discount 250.00', r.ok && r.row.discount === '250.00', r.ok ? `discount ${r.row.discount}` : r.err);
  r = await book('B', S[5], { code: 'HALF-AAAAAA' });
  check("B uses A's personal code", 'refused', !r.ok && r.err.includes("isn't valid"), r.err);
  r = await book('B', S[5], { code: 'OLDCODE' });
  check('Expired code', 'refused', !r.ok && r.err.includes('expired'), r.err);
  r = await book('B', S[5], { code: 'ONEUSE' });
  const oneUseBooking = r.row?.booking_id;
  r = await book('C', S[5], { code: 'ONEUSE' });
  check('1-use code while another unpaid booking holds it', 'refused', !r.ok && r.err.includes('waiting for payment'), r.err);
  // Pretend B's booking got paid (like the PayMongo webhook will do in Phase D).
  await q("update public.bookings set status = 'confirmed' where id = $1", [oneUseBooking]);
  const usesLeft = (await one("select uses_left from public.vouchers where code = 'ONEUSE'")).uses_left;
  check('Booking paid -> the voucher use is spent', 'uses_left 0', usesLeft === 0, `uses_left ${usesLeft}`);
  r = await book('C', S[5], { code: 'ONEUSE' });
  check('1-use code after it was spent', 'refused', !r.ok && r.err.includes('already been used'), r.err);
}

// Shows a price breakdown in words, e.g. "class 500.00 + mat 50.00 - discount 0.00 = 550.00".
function money(x) {
  return `class ${x.class_fee} + mat ${x.mat_fee} - discount ${x.discount} = ${x.total}`;
}
