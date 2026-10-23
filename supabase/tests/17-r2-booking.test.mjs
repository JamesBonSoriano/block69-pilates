// Tests for migration 15 (..._r2_booking.sql), Change 17, Part F:
//   - booking works WITHOUT the not-pregnant tick, and saves it as "not asked"
//   - the Registration Agreement is still required (by book_seat AND the table)
//   - walk-ins still record the in-person check
//   - classes exist 9 weeks ahead, so next month shows real classes
//   - the new Registration Agreement text, only replacing the old draft
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Change 17: booking without the not-pregnant tick, 9 weeks of classes, new agreement';

// The migration file itself, so it can be run a second time.
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const BOOKING_FILE = path.join(migrationsDir, fs.readdirSync(migrationsDir).find((f) => f.endsWith('_r2_booking.sql')));

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, book } = t;

  await t.addUser('A');
  await t.addUser('B');
  await t.addUser('admin', { admin: true });
  // A class 3 days away (open, 4 seats)
  const S1 = await t.sessionIn(72);

  // ===========================================================================
  t.section('Booking without the not-pregnant tick');
  // ===========================================================================
  let r = await book('A', S1);
  check('A books with only the Registration Agreement ticked', 'held', r.ok, r.ok ? 'held' : r.err);
  const saved = r.ok ? await one('select not_pregnant_confirmed, agreed_at from public.bookings where id = $1', [r.row.booking_id]) : null;
  check('Saved as "not asked" (null), with the agreement time', 'null + agreed_at',
    saved?.not_pregnant_confirmed === null && saved?.agreed_at !== null, saved && `${saved.not_pregnant_confirmed} + ${saved.agreed_at ? 'agreed_at' : 'no agreed_at'}`);

  r = await t.attempt('B', 'select * from public.book_seat(p_session_id => $1, p_agreed => false)', [S1]);
  check('Without the Registration Agreement', 'refused', !r.ok && r.err.includes('Agreement'), r.err);

  r = await t.attempt('B', 'select * from public.book_seat(p_session_id => $1, p_not_pregnant => true, p_agreed => true)', [S1]);
  check('The old p_not_pregnant input is gone', 'refused (no such input)', !r.ok, r.err);

  // The table itself still refuses a booking with no agreement, even from
  // trusted server code that skips book_seat
  r = await t.attempt('server', `insert into public.bookings (session_id, walkin_name, status, class_fee, total, agreed_at)
                                 values ($1, 'No Agreement', 'confirmed', 500, 500, null)`, [S1]);
  check('Table check: a booking with no agreement', 'refused (bookings_agreement_required)',
    !r.ok && r.err.includes('bookings_agreement_required'), r.err);
  r = await t.attempt('server', `insert into public.bookings (session_id, walkin_name, status, class_fee, total, agreed_at)
                                 values ($1, 'Agreed Only', 'confirmed', 500, 500, now()) returning id`, [S1]);
  check('Table check: agreement only, no not-pregnant answer', 'allowed', r.ok, r.err ?? 'allowed');

  // ===========================================================================
  t.section('Walk-ins (admin side unchanged)');
  // ===========================================================================
  // (t.as KEEPS the booking, so it can be read back below)
  const walk = await t.as('admin', `select * from public.admin_walkin_booking(
      p_session_id => $1, p_name => 'Walk In', p_contact => '09171234567', p_payment_method => 'cash',
      p_not_pregnant => true, p_agreed => true, p_drink_choice => 'Iced Matcha')`, [S1]);
  const walkRow = walk.ok ? await one('select not_pregnant_confirmed from public.bookings where id = $1', [walk.row.booking_id]) : null;
  check('Walk-in still records the in-person check', 'true', walkRow?.not_pregnant_confirmed === true, walk.ok ? String(walkRow?.not_pregnant_confirmed) : walk.err);

  // ===========================================================================
  t.section('Classes 9 weeks ahead (this month and next month)');
  // ===========================================================================
  const setting = await one(`select value from public.settings where key = 'sessions_weeks_ahead'`);
  check('"Weeks ahead" setting', '9', Number(setting.value) === 9, JSON.stringify(setting.value));

  const range = await one(`
    select (max(date) - public.manila_today())::int as last_day,
           -- the last day of NEXT month (Philippine time)
           ((date_trunc('month', public.manila_today()) + interval '2 months - 1 day')::date - public.manila_today())::int as end_of_next_month,
           count(*) filter (where date_trunc('month', date) = date_trunc('month', public.manila_today()) + interval '1 month')::int as next_month_classes
    from public.class_sessions`);
  check('Classes reach 9 weeks ahead', 'last class 56 to 62 days away', range.last_day >= 56 && range.last_day <= 62, `${range.last_day} days`);
  check('Every Thu-Sun of next month has its classes', `classes up to day ${range.end_of_next_month}`,
    range.last_day + 7 > range.end_of_next_month && range.next_month_classes > 0,
    `last class day ${range.last_day}, end of next month day ${range.end_of_next_month}, ${range.next_month_classes} next-month classes`);

  // The website asks get_open_sessions() for today to the end of next month.
  // (The dates are worked out first: guests can't call manila_today().)
  const dates = await one(`
    select public.manila_today()::text as today,
           (date_trunc('month', public.manila_today()) + interval '2 months - 1 day')::date::text as last`);
  const listed = await t.attempt('guest', 'select count(*)::int as n from public.get_open_sessions($1::date, $2::date)',
    [dates.today, dates.last]);
  const stored = await one('select count(*)::int as n from public.class_sessions where date between $1::date and $2::date',
    [dates.today, dates.last]);
  check('Booking step 1 gets every class of this month and next month', `${stored.n} classes`,
    listed.ok && listed.row.n === stored.n, listed.ok ? `${listed.row.n} classes` : listed.err);

  // ===========================================================================
  t.section('The new Registration Agreement');
  // ===========================================================================
  const agreement = async () =>
    (await one(`select body from public.site_content where page = 'booking' and section = 'agreement'`)).body;
  const text = await agreement();
  const paragraphs = text.split('\n');
  check('Four paragraphs, from "By submitting" to the social line', '4 paragraphs',
    paragraphs.length === 4 && paragraphs[0].startsWith('By submitting this registration form') && paragraphs[3].includes('@block69cafe'),
    `${paragraphs.length} paragraphs`);
  check('Social handles use the link fill-in words', '{facebook_link} and {instagram_link}',
    text.includes('{facebook_link}') && text.includes('{instagram_link}'), paragraphs[3]);
  check('No not-pregnant line any more', 'no "pregnant"', !/pregnant/i.test(text), /pregnant/i.test(text) ? 'still there' : 'gone');

  // An admin's own wording is never replaced, and running the file again is safe
  await q(`update public.site_content set body = 'Our own agreement' where page = 'booking' and section = 'agreement'`);
  let again;
  try {
    await t.db.query(fs.readFileSync(BOOKING_FILE, 'utf8'));
    again = { ok: true };
  } catch (e) {
    again = { ok: false, err: e.message };
  }
  check('Run migration 15 again: no errors', 'ok', again.ok, again.ok ? 'ok' : again.err);
  check("An admin's own agreement is kept", 'Our own agreement', (await agreement()) === 'Our own agreement', await agreement());
}
