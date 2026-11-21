// Tests for migration 28 (..._v17_schedule.sql), Version 1.7 Prompt D.
//   - keep_classes_open() opens the next 9 weeks (the setting), never makes
//     a class twice, and never brings back a class the admin cancelled
//   - adding a weekly pattern row opens its classes at once
//   - changing a row's time removes ONLY its never-booked future open
//     classes (booked and cancelled ones stay) and opens the new time
//   - turning a row Off removes its never-booked future open classes
//   - more weeks in the setting = more weeks opened
//   - clients and guests can't run keep_classes_open()
// Run with: npm run test:db   (see supabase/tests/README.md)

import { readFileSync } from 'node:fs';

export const title = 'Version 1.7: classes open by themselves (pattern trigger, nightly job)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, attempt } = t;
  // This historical suite reenables Version 1.7 only in its disposable database.
  await t.q(readFileSync(new URL("../migrations/20261117000002_v17_schedule.sql", import.meta.url), "utf8"));
  await t.addUser('A');
  await t.addUser('admin', { admin: true });

  // How many classes exist on Wednesdays (weekday 3) at one start time, from
  // today on, and how many of them are cancelled / booked.
  async function wednesdays(startTime) {
    return one(`
      select count(*)::int as total,
             count(*) filter (where s.status = 'cancelled')::int as cancelled
      from public.class_sessions s
      where extract(dow from s.date) = 3 and s.start_time = $1 and s.date >= public.manila_today()`, [startTime]);
  }
  // How many Wednesdays there are in the next N weeks (from today).
  async function wednesdaysInWeeks(weeks) {
    return (await one(`
      select count(*)::int as n
      from generate_series(public.manila_today()::timestamp, (public.manila_today() + ($1 * 7 - 1))::timestamp, interval '1 day') d
      where extract(dow from d) = 3`, [weeks])).n;
  }
  // The Wednesday class at a start time, at least `days` days from today.
  async function wednesdayClass(startTime, days) {
    return (await one(`
      select id from public.class_sessions
      where extract(dow from date) = 3 and start_time = $1 and date >= public.manila_today() + $2::integer
      order by date limit 1`, [startTime, days])).id;
  }

  // ===========================================================================
  t.section('keep_classes_open()');
  // ===========================================================================
  let r = await as('server', 'select public.keep_classes_open() as n');
  check('Run it (the nightly job runs it like this)', 'works', r.ok, r.err);
  r = await as('server', 'select public.keep_classes_open() as n');
  check('Run it again', '0 new classes (nothing twice)', r.ok && r.row?.n === 0, r.err ?? r.row?.n);
  const dupes = await one(`select count(*)::int as n from (select date, start_time from public.class_sessions group by 1, 2 having count(*) > 1) x`);
  check('Duplicate classes', 'none', dupes.n === 0, dupes.n);
  r = await attempt('A', 'select public.keep_classes_open()');
  check('A client runs it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('guest', 'select public.keep_classes_open()');
  check('A guest runs it', 'refused', !r.ok, r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Add class (a new weekly pattern row)');
  // ===========================================================================
  const nine = await wednesdaysInWeeks(9);
  r = await as('admin', `insert into public.schedule_templates (weekday, start_time, end_time, default_capacity, is_active)
    values (3, '18:00', '18:50', 4, true) returning id`);
  const wed = r.row?.id;
  check('The admin adds Wednesday 6:00 PM', 'saved', r.ok && Boolean(wed), r.err);
  let count = await wednesdays('18:00:00');
  check('Its classes', `opened at once: ${nine} Wednesdays (9 weeks)`, count.total === nine, count.total);

  // The admin cancels one of them; a client books another
  const cancelledId = await wednesdayClass('18:00:00', 14);
  await t.db.query(`update public.class_sessions set status = 'cancelled' where id = $1`, [cancelledId]);
  const bookedId = await wednesdayClass('18:00:00', 21);
  await t.confirmedBooking(bookedId, 'A');
  r = await as('server', 'select public.keep_classes_open() as n');
  count = await wednesdays('18:00:00');
  check('Run the nightly job after a cancel', 'the cancelled class stays cancelled (not brought back, no new copy)',
    r.ok && count.total === nine && count.cancelled === 1, JSON.stringify(count));

  // ===========================================================================
  t.section('Change a pattern row\'s time');
  // ===========================================================================
  r = await as('admin', `update public.schedule_templates set start_time = '19:00', end_time = '19:50' where id = $1`, [wed]);
  check('Move Wednesday 6:00 PM to 7:00 PM', 'saved', r.ok, r.err);
  const old = await wednesdays('18:00:00');
  check('The old 6:00 PM classes', 'only the booked one and the cancelled one are left', old.total === 2 && old.cancelled === 1, JSON.stringify(old));
  const still = await one(`select status from public.class_sessions where id = $1`, [bookedId]);
  check('The booked 6:00 PM class', 'still there and open', still?.status === 'open', JSON.stringify(still));
  count = await wednesdays('19:00:00');
  check('The new 7:00 PM classes', `opened: ${nine}`, count.total === nine, count.total);

  // ===========================================================================
  t.section('Turn a pattern row Off');
  // ===========================================================================
  const booked7 = await wednesdayClass('19:00:00', 21);
  await t.confirmedBooking(booked7, 'A');
  r = await as('admin', `update public.schedule_templates set is_active = false where id = $1`, [wed]);
  check('Turn Wednesday 7:00 PM Off', 'saved', r.ok, r.err);
  count = await wednesdays('19:00:00');
  check('Its classes', 'only the booked one is left', count.total === 1, count.total);
  r = await as('server', 'select public.keep_classes_open() as n');
  count = await wednesdays('19:00:00');
  check('The nightly job after Off', 'brings nothing back', r.ok && count.total === 1, count.total);

  // ===========================================================================
  t.section('Weeks ahead setting');
  // ===========================================================================
  await t.db.query(`update public.settings set value = '10'::jsonb where key = 'sessions_weeks_ahead'`);
  r = await as('admin', `update public.schedule_templates set is_active = true where id = $1`, [wed]);
  count = await wednesdays('19:00:00');
  const ten = await wednesdaysInWeeks(10);
  check('Setting = 10 weeks, row back On', `${ten} Wednesdays at 7:00 PM`, r.ok && count.total === ten, r.err ?? count.total);
}
