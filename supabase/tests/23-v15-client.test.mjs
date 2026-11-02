// Tests for migration 21 (..._v15_client.sql), Version 1.5 client side.
//   - classes run Thursday to Saturday: Sunday templates are off, future
//     Sunday classes are gone (or cancelled if they had bookings), and
//     "Open classes for booking" never makes a Sunday again
//   - C6: NEXT MONTH's open classes come back from get_open_sessions (the
//     list the ▶ arrow on /book shows)
//   - the About Us text says Thursday to Saturday
//   - C8: the rescheduling window after the cafe cancels a class
//     (cancelled_at, move_by, 'move_window_ended', the transfer refused after
//     the last day, the setting, the bell's move_by)
//   - running the migration a second time is safe
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Version 1.5: Thu-Sat classes, next month, rescheduling window';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, q, as, attempt, status, sessionIn } = t;
  for (const key of ['A', 'B']) await t.addUser(key);
  await t.addUser('admin', { admin: true });

  // Is a 'YYYY-MM-DD' date (or a JS Date from pg) a Sunday?
  const isSunday = (d) => new Date(`${String(toDay(d))}T00:00:00Z`).getUTCDay() === 0;
  // pg gives dates back as JS Dates (local midnight): turn them into 'YYYY-MM-DD'
  function toDay(d) {
    if (typeof d === 'string') return d.slice(0, 10);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  // A's row for one booking in get_my_bookings.
  const myRow = async (actor, bookingId) =>
    (await attempt(actor, 'select * from public.get_my_bookings() where booking_id = $1', [bookingId])).row;
  // Today in Manila, as 'YYYY-MM-DD'.
  const today = toDay((await one('select public.manila_today() as d')).d);

  // ===========================================================================
  t.section('Thursday to Saturday only');
  // ===========================================================================
  const templates = await q('select weekday, is_active from public.schedule_templates order by weekday, start_time');
  check('Sunday templates', 'both switched off', templates.filter((x) => x.weekday === 0).every((x) => !x.is_active),
    JSON.stringify(templates.filter((x) => x.weekday === 0)));
  const activeDays = [...new Set(templates.filter((x) => x.is_active).map((x) => x.weekday))].sort();
  check('Active class days', 'Thu, Fri, Sat (4, 5, 6)', activeDays.join(',') === '4,5,6', activeDays.join(','));

  let futureSundays = await q(`select date from public.class_sessions where date >= public.manila_today() and extract(dow from date) = 0`);
  check('Future Sunday classes after the migration', 'none', futureSundays.length === 0, futureSundays.length);

  // "Open classes for booking" for 9 weeks makes no Sunday
  await as('admin', 'select public.generate_sessions(9)');
  futureSundays = await q(`select date from public.class_sessions where date >= public.manila_today() and extract(dow from date) = 0`);
  check('Open classes for booking (9 weeks)', 'still no Sunday classes', futureSundays.length === 0, futureSundays.length);

  // ===========================================================================
  t.section('C6: next month has open classes');
  // ===========================================================================
  // The same range /book asks for when ▶ is clicked: the whole of next month
  const nextMonth = await one(`
    select (date_trunc('month', public.manila_today()) + interval '1 month')::date as first,
           (date_trunc('month', public.manila_today()) + interval '2 months - 1 day')::date as last`);
  const r = await attempt('guest', 'select * from public.get_open_sessions($1, $2)', [nextMonth.first, nextMonth.last]);
  const rows = r.rows ?? [];
  check('Guest asks for next month', 'classes come back', r.ok && rows.length > 0, r.err ?? rows.length);
  check('Next month\'s classes', 'all open and bookable', rows.length > 0 && rows.every((x) => x.is_bookable && x.state === 'open'),
    rows.filter((x) => !x.is_bookable).length + ' not bookable');
  check('Next month\'s classes', 'all inside next month', rows.every((x) => toDay(x.date) >= toDay(nextMonth.first) && toDay(x.date) <= toDay(nextMonth.last)),
    rows.map((x) => toDay(x.date)).join(' '));
  check('Next month\'s classes', 'Thursday to Saturday only, 2 a day', rows.every((x) => !isSunday(x.date)) &&
    rows.length === 2 * new Set(rows.map((x) => toDay(x.date))).size, `${rows.length} classes`);

  // ===========================================================================
  t.section('About Us text');
  // ===========================================================================
  const cafe = await one(`select body from public.site_content where page = 'about' and section = 'cafe'`);
  check('About Us cafe text', 'Thursday to Saturday', /Thursday to Saturday/.test(cafe.body) && !/Sunday/.test(cafe.body), cafe.body);

  // ===========================================================================
  t.section('cancelled_at is stamped');
  // ===========================================================================
  const cls = await sessionIn(24 * 10);
  await t.confirmedBooking(cls, 'A');
  await as('admin', 'select public.admin_cancel_session($1)', [cls]);
  let s = await one('select status, cancelled_at, cancelled_at > now() - interval \'1 minute\' as fresh from public.class_sessions where id = $1', [cls]);
  check('Admin cancels a class', 'cancelled_at = now', s.status === 'cancelled' && s.fresh === true, JSON.stringify(s));
  // Reopen and cancel again: cleared, then stamped again
  await t.db.query(`update public.class_sessions set status = 'open' where id = $1`, [cls]);
  s = await one('select cancelled_at from public.class_sessions where id = $1', [cls]);
  check('Class opened again', 'cancelled_at cleared', s.cancelled_at === null, s.cancelled_at);
  await t.db.query(`update public.class_sessions set status = 'cancelled' where id = $1`, [cls]);

  // ===========================================================================
  t.section('C8: the free move and its window');
  // ===========================================================================
  // The class is in 10 days and was cancelled today: the window runs 30
  // days from the CLASS day (the later one)
  const bookingA = (await one('select id from public.bookings where session_id = $1', [cls])).id;
  const classDay = toDay((await one('select date from public.class_sessions where id = $1', [cls])).date);
  const expectedLast = toDay((await one(`select ($1::date + 30) as d`, [classDay])).d);
  let row = await myRow('A', bookingA);
  check('My Bookings for a class the cafe cancelled', `free_transfer, can move, move_by ${expectedLast}`,
    row?.change_rule === 'free_transfer' && row.can_transfer === true && row.is_upcoming === true && toDay(row.move_by) === expectedLast,
    row && `${row.change_rule}, ${row.can_transfer}, ${row.is_upcoming}, ${toDay(row.move_by)}`);

  const notice = (await attempt('A', `select * from public.get_my_notifications() where kind = 'class_cancelled' and booking_id = $1`, [bookingA])).row;
  check('The bell\'s "class cancelled" update', `move_by ${expectedLast}`, notice && toDay(notice.move_by) === expectedLast, notice && toDay(notice.move_by));

  // A class 3 days ago, cancelled 20 days ago: the window starts on the class day
  const oldCls = await sessionIn(-24 * 3);
  const bookingOld = await t.confirmedBooking(oldCls, 'B');
  await t.db.query(`update public.class_sessions set status = 'cancelled', cancelled_at = now() - interval '20 days' where id = $1`, [oldCls]);
  row = await myRow('B', bookingOld);
  check('Class over 3 days ago, cancelled 20 days ago', 'can still move (27 days left)', row?.change_rule === 'free_transfer' && row.can_transfer === true,
    row && `${row.change_rule}, ${row.can_transfer}`);

  // The window has ended: a class 40 days ago, cancelled 45 days ago
  const endedCls = await sessionIn(-24 * 40);
  const bookingEnded = await t.confirmedBooking(endedCls, 'A');
  await t.db.query(`update public.class_sessions set status = 'cancelled', cancelled_at = now() - interval '45 days' where id = $1`, [endedCls]);
  row = await myRow('A', bookingEnded);
  check('Window over (class 40 days ago)', "move_window_ended, can't move, under Past",
    row?.change_rule === 'move_window_ended' && row.can_transfer === false && row.is_upcoming === false && row.move_by !== null,
    row && `${row.change_rule}, ${row.can_transfer}, ${row.is_upcoming}`);

  const [target] = await t.emptySessions(3);
  let tr = await attempt('A', 'select public.transfer_my_booking($1, $2)', [bookingEnded, target]);
  check('Move it anyway', 'refused (the time ended)', !tr.ok && /time to move this booking ended/.test(tr.err), tr.err ?? 'ALLOWED');
  check('The booking after the refused move', 'still confirmed', (await status(bookingEnded)) === 'confirmed', await status(bookingEnded));

  // Inside the window the move works (and it's free, even within 24 hours)
  tr = await as('B', 'select public.transfer_my_booking($1, $2) as id', [bookingOld, target]);
  check('B moves inside the window', 'moved', tr.ok && (await status(bookingOld)) === 'transferred', tr.err ?? await status(bookingOld));

  // The last day itself still counts (window ends at the END of that day)
  const lastDayCls = await sessionIn(-24 * 31);
  const bookingLastDay = await t.confirmedBooking(lastDayCls, 'B');
  // Cancelled before the class; class day + 30 = today
  await t.db.query(`
    update public.class_sessions
    set status = 'cancelled', cancelled_at = now() - interval '40 days',
        date = public.manila_today() - 30
    where id = $1`, [lastDayCls]);
  row = await myRow('B', bookingLastDay);
  check('Today is the last day', 'can still move', row?.change_rule === 'free_transfer' && toDay(row.move_by) === today,
    row && `${row.change_rule}, ${toDay(row.move_by)}`);

  // ===========================================================================
  t.section('The window setting');
  // ===========================================================================
  for (const bad of [0, 366, 2.5, '"abc"']) {
    const res = await attempt('admin', `select public.admin_update_settings(jsonb_build_object('reschedule_window_days', $1::jsonb))`, [String(bad)]);
    check(`Rescheduling window = ${bad}`, 'refused', !res.ok, res.err ?? 'SAVED');
  }
  let res = await attempt('A', `select public.admin_update_settings('{"reschedule_window_days": 7}'::jsonb)`);
  check('A client changes the window', 'refused', !res.ok, res.err ?? 'SAVED');
  res = await as('admin', `select public.admin_update_settings('{"reschedule_window_days": 7}'::jsonb)`);
  check('Admin sets the window to 7 days', 'saved', res.ok, res.err);
  row = await myRow('A', bookingA);
  const expected7 = toDay((await one(`select ($1::date + 7) as d`, [classDay])).d);
  check('My Bookings after the change', `move_by ${expected7}`, toDay(row?.move_by) === expected7, row && toDay(row.move_by));
  const pub = (await attempt('guest', `select value from public.settings where key = 'reschedule_window_days'`)).row;
  check('Guests can read the window setting', '7', pub && Number(pub.value) === 7, pub && JSON.stringify(pub.value));

  // ===========================================================================
  t.section('Private helpers');
  // ===========================================================================
  for (const actor of ['guest', 'A']) {
    const x = await attempt(actor, 'select public.free_move_last_day(now(), current_date)');
    check(`${actor} calls free_move_last_day directly`, 'refused', !x.ok, x.err ?? 'ALLOWED');
  }
  const other = (await attempt('B', `select count(*)::int as n from public.get_my_notifications() where booking_id = $1`, [bookingA])).row;
  check("B's bell", "never shows A's updates", other?.n === 0, other?.n);

  // ===========================================================================
  t.section('Running the migration again');
  // ===========================================================================
  // A future Sunday WITH a booking and one without, then run the file again
  const sunday = (await one(`
    select (public.manila_today() + ((7 - extract(dow from public.manila_today())::int) % 7 + 7))::date as d`)).d;
  const bookedSunday = (await one(`insert into public.class_sessions (date, start_time, end_time, capacity)
    values ($1, '09:00', '09:50', 4) returning id`, [sunday])).id;
  const sundayBooking = await t.confirmedBooking(bookedSunday, 'A');
  const emptySunday = (await one(`insert into public.class_sessions (date, start_time, end_time, capacity)
    values ($1, '10:15', '11:05', 4) returning id`, [sunday])).id;

  // supabase/migrations, found from this test file's own folder
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const file = fs.readdirSync(dir).find((f) => f.endsWith('_v15_client.sql'));
  let again = { ok: true };
  try {
    await t.db.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (e) {
    again = { ok: false, err: e.message };
  }
  check('Run the migration a second time', 'works', again.ok, again.err);
  s = await one('select status, cancelled_at from public.class_sessions where id = $1', [bookedSunday]);
  check('Future Sunday WITH a booking', 'cancelled (not deleted), cancelled_at set', s?.status === 'cancelled' && s.cancelled_at !== null, JSON.stringify(s));
  check('Its booking', 'kept, still confirmed', (await status(sundayBooking)) === 'confirmed', await status(sundayBooking));
  const told = await one(`select count(*)::int as n from public.notifications where booking_id = $1 and kind = 'class_cancelled'`, [sundayBooking]);
  check('Its client', 'gets the "class cancelled" update', told.n === 1, told.n);
  row = await myRow('A', sundayBooking);
  check('Its client in My Bookings', 'free move offered', row?.change_rule === 'free_transfer' && row.can_transfer === true, row && row.change_rule);
  const gone = await one('select count(*)::int as n from public.class_sessions where id = $1', [emptySunday]);
  check('Future Sunday with NO bookings', 'deleted', gone.n === 0, gone.n);
  const setting = await one(`select value from public.settings where key = 'reschedule_window_days'`);
  check('The window setting after running again', 'admin value 7 kept', Number(setting.value) === 7, JSON.stringify(setting.value));
}
