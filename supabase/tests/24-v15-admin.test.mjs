// Tests for migration 22 (..._v15_admin.sql), Version 1.5 admin Bookings list.
//   - A1: a booking still 'confirmed' after its class has ENDED shows as
//     "pending attendance" (attendance_due), is found by the
//     'pending_attendance' filter and no longer by 'confirmed'. Classes that
//     haven't ended, and classes the cafe cancelled, are not "due".
//     Marking Attended / No-show takes it off that list.
//   - A2: the Attended and No-show filters list only their own status, and
//     Forfeited no longer has to include no-shows
//   - A3: pages (p_offset): 25 bookings in pages of 10 = 10 + 10 + 5, with
//     no row twice, and total_matches is 25 on every page
//   - only admins can call it; an unknown filter word is refused
//   - the click-through SQL (manual-tests/v15-setup.sql and v15-cleanup.sql)
//     runs, makes what it says, and cleans up completely
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Version 1.5: admin Bookings list (pending attendance, tabs, pages)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, attempt, sessionIn } = t;
  for (const key of ['A', 'B', 'C', 'D']) await t.addUser(key);
  await t.addUser('admin', { admin: true });

  // Asks the Bookings list as the admin.
  // Takes: the filters (statuses, search, when, limit, offset).
  // Gives back: the rows (empty if refused).
  async function list({ statuses = null, search = null, when = 'all', limit = 200, offset = 0 } = {}) {
    const r = await attempt('admin',
      `select * from public.admin_search_bookings(p_search => $1, p_statuses => $2, p_when => $3,
                                                  p_limit => $4, p_offset => $5)`,
      [search, statuses, when, limit, offset]);
    if (!r.ok) throw new Error(r.err);
    return r.rows;
  }
  const ids = (rows) => rows.map((x) => x.booking_id);

  // A paid, confirmed booking (attendance needs a paid payment)
  async function paidBooking(sessionId, userKey) {
    const id = await t.confirmedBooking(sessionId, userKey);
    await t.pay(id);
    return id;
  }

  const ended = await paidBooking(await sessionIn(-3), 'A');           // class ended 2+ hours ago
  const running = await paidBooking(await sessionIn(-0.25), 'B');      // started 15 min ago, still on
  const future = await paidBooking(await sessionIn(48), 'C');          // in 2 days
  const cancelledCls = await sessionIn(-5);
  const inCancelled = await paidBooking(cancelledCls, 'D');
  await t.db.query(`update public.class_sessions set status = 'cancelled' where id = $1`, [cancelledCls]);

  // ===========================================================================
  t.section('A1: Pending Attendance Verification');
  // ===========================================================================
  const all = await list();
  const row = (id) => all.find((x) => x.booking_id === id);
  check('Confirmed booking, class ended', 'attendance_due = true (status still confirmed)',
    row(ended)?.attendance_due === true && row(ended)?.status === 'confirmed', JSON.stringify(row(ended) && [row(ended).status, row(ended).attendance_due]));
  check('Confirmed booking, class still running', 'not due yet', row(running)?.attendance_due === false, row(running)?.attendance_due);
  check('Confirmed booking, class in 2 days', 'not due', row(future)?.attendance_due === false, row(future)?.attendance_due);
  check('Confirmed booking, class the cafe cancelled', 'not due (client moves instead)', row(inCancelled)?.attendance_due === false,
    row(inCancelled)?.attendance_due);

  let pending = ids(await list({ statuses: ['pending_attendance'] }));
  check("Filter 'pending_attendance'", 'only the ended class booking',
    pending.includes(ended) && !pending.includes(running) && !pending.includes(future) && !pending.includes(inCancelled), pending.length);
  const confirmed = ids(await list({ statuses: ['confirmed'] }));
  check("Filter 'confirmed'", 'no longer lists the ended one, still lists the others',
    !confirmed.includes(ended) && confirmed.includes(running) && confirmed.includes(future), confirmed.length);
  const needs = ids(await list({ statuses: ['awaiting_verification', 'paid_needs_action', 'pending_attendance'] }));
  check('Needs action (with pending_attendance)', 'lists the ended one', needs.includes(ended), needs.length);

  // The admin's final check-in
  let r = await as('admin', `select public.admin_set_attendance($1, 'attended')`, [ended]);
  check('Admin marks it Attended', 'saved', r.ok, r.err);
  pending = ids(await list({ statuses: ['pending_attendance'] }));
  check('After marking', 'off the pending list', !pending.includes(ended), pending.length);

  // ===========================================================================
  t.section('A2: Attended and No-show tabs');
  // ===========================================================================
  const noShowCls = await sessionIn(-26);
  const noShow = await paidBooking(noShowCls, 'B');
  r = await as('admin', `select public.admin_set_attendance($1, 'no_show')`, [noShow]);
  check('Admin marks another No-show', 'saved', r.ok, r.err);
  const attendedRows = await list({ statuses: ['attended'] });
  check("Filter 'attended'", 'only attended bookings, incl. the one just marked',
    ids(attendedRows).includes(ended) && attendedRows.every((x) => x.status === 'attended'), attendedRows.map((x) => x.status).join(','));
  const noShowRows = await list({ statuses: ['no_show'] });
  check("Filter 'no_show'", 'only no-shows', ids(noShowRows).includes(noShow) && noShowRows.every((x) => x.status === 'no_show'),
    noShowRows.map((x) => x.status).join(','));
  const forfeitedRows = await list({ statuses: ['forfeited'] });
  check("Filter 'forfeited' alone", 'no no-shows in it', !ids(forfeitedRows).includes(noShow), forfeitedRows.length);

  // ===========================================================================
  t.section('A3: pages');
  // ===========================================================================
  // 25 walk-in bookings called "Pagetest N", spread over the generated classes
  const sessions = await t.emptySessions(3);
  for (let n = 1; n <= 25; n++) {
    await one(`
      insert into public.bookings (session_id, walkin_name, walkin_contact, status, mat_rental,
                                   class_fee, mat_fee, total, not_pregnant_confirmed, agreed_at)
      values ($1, $2, '09171234567', 'confirmed', false, 500, 0, 500, true, now())
      returning id`, [sessions[n % 6], `Pagetest ${String(n).padStart(2, '0')}`]);
  }
  const page1 = await list({ search: 'Pagetest', limit: 10, offset: 0 });
  const page2 = await list({ search: 'Pagetest', limit: 10, offset: 10 });
  const page3 = await list({ search: 'Pagetest', limit: 10, offset: 20 });
  const page4 = await list({ search: 'Pagetest', limit: 10, offset: 30 });
  check('Pages of 10', '10, 10, 5, then 0', page1.length === 10 && page2.length === 10 && page3.length === 5 && page4.length === 0,
    [page1, page2, page3, page4].map((p) => p.length).join(', '));
  check('total_matches on every page', '25', [page1, page2, page3].every((p) => p.every((x) => x.total_matches === 25)),
    [page1[0]?.total_matches, page2[0]?.total_matches, page3[0]?.total_matches].join(', '));
  const every = [...ids(page1), ...ids(page2), ...ids(page3)];
  check('The 3 pages together', '25 different bookings (none twice)', new Set(every).size === 25, new Set(every).size);
  const whole = ids(await list({ search: 'Pagetest' }));
  check('Pages follow the same order as the whole list', 'yes', JSON.stringify(whole) === JSON.stringify(every), 'different order');
  const negative = await list({ search: 'Pagetest', limit: 10, offset: -5 });
  check('A negative offset', 'treated as 0 (page 1)', JSON.stringify(ids(negative)) === JSON.stringify(ids(page1)), negative.length);

  // ===========================================================================
  t.section('Who may call it');
  // ===========================================================================
  r = await attempt('A', 'select * from public.admin_search_bookings()');
  check('A client calls it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('guest', 'select * from public.admin_search_bookings()');
  check('A guest calls it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('admin', `select * from public.admin_search_bookings(p_statuses => '{nonsense}')`);
  check('An unknown filter word', 'refused', !r.ok && /Unknown booking status/.test(r.err), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Click-through SQL (supabase/manual-tests/v15-*.sql)');
  // ===========================================================================
  // Runs the hand-pasted setup with this test's users, checks what it made,
  // then runs the cleanup. (So the files are known to work before you paste them.)
  const dir = fileURLToPath(new URL('../manual-tests/', import.meta.url));
  const setupSql = fs.readFileSync(path.join(dir, 'v15-setup.sql'), 'utf8')
    .replace('YOUR-TEST-CLIENT-EMAIL', 'c@test.example')
    .replace('YOUR-ADMIN-EMAIL', 'admin@test.example');
  let made;
  try {
    const results = await t.db.query(setupSql);
    made = results[results.length - 1].rows[0];
  } catch (e) {
    made = { error: e.message };
  }
  check('v15-setup.sql runs', 'no error', !made.error, made.error);
  const tomorrow = toDay((await one('select public.manila_today() + 1 as d')).d);
  check('What it made', '3 pending, 12 attended, 4 no-show, 2 cancelled, move by tomorrow',
    Number(made.pending_attendance) === 3 && Number(made.attended) === 12 && Number(made.no_show) === 4 &&
      Number(made.cancelled_classes) === 2 && made.move_by_tomorrow && toDay(made.move_by_tomorrow) === tomorrow,
    JSON.stringify(made));
  const cRows = (await attempt('C', `select change_rule from public.get_my_bookings() where session_status = 'cancelled' order by class_date`)).rows ?? [];
  check("Test client's cancelled-class bookings", 'one ended, one still movable',
    cRows.map((x) => x.change_rule).join(',') === 'move_window_ended,free_transfer', cRows.map((x) => x.change_rule).join(','));
  const attendedPages = await list({ statuses: ['attended'], search: 'TEST V15', limit: 10 });
  check('Attended chip with the test data', '12 matches (2 pages of 10)', attendedPages[0]?.total_matches === 12, attendedPages[0]?.total_matches);

  let left;
  try {
    const results = await t.db.query(fs.readFileSync(path.join(dir, 'v15-cleanup.sql'), 'utf8'));
    left = results[results.length - 1].rows[0];
  } catch (e) {
    left = { error: e.message };
  }
  check('v15-cleanup.sql', 'runs and leaves 0, 0, 0, 0',
    !left.error && Object.values(left).every((n) => Number(n) === 0), JSON.stringify(left));
}

// pg gives dates back as JS Dates (local midnight): turn them into 'YYYY-MM-DD'
function toDay(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
