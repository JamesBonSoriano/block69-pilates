// Tests for migration 17 (..._v14_account.sql), Revisions "Version 1.4":
//   - Deactivate is blocked by the same things as Delete account
//   - deactivating marks the account as SELF-deactivated
//   - reactivate_my_account(): only your own, only if you turned it off yourself
//   - the website can't set the flag directly; admins clear it
//   - the Home mat rental card text (an admin's own wording is kept)
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Version 1.4: deactivate / reactivate, Home mat card';

// This migration file, so it can be run a second time.
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const V14_FILE = path.join(migrationsDir, fs.readdirSync(migrationsDir).find((f) => f.endsWith('_v14_account.sql')));

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as } = t;

  const A = await t.addUser('A');
  const B = await t.addUser('B');
  const C = await t.addUser('C');
  const admin = await t.addUser('admin', { admin: true });
  // Reads the two columns this migration is about
  const state = (id) =>
    one('select is_active, self_deactivated_at is not null as self from public.profiles where id = $1', [id]);

  // ===========================================================================
  t.section('Deactivate: blocked like Delete account');
  // ===========================================================================
  const [S1, S2] = await t.emptySessions(3);
  const booking = await t.confirmedBooking(S1, 'A');
  let r = await t.attempt('A', 'select public.deactivate_my_account()');
  check('Deactivate with an upcoming class', 'refused, says to cancel first',
    !r.ok && /can't be deactivated yet/.test(r.err) && /cancel it in My Bookings/.test(r.err), r.err ?? 'ALLOWED');
  check('Still active', 'active', (await state(A)).is_active === true, JSON.stringify(await state(A)));

  const hold = await t.book('A', S2);
  await q(`update public.bookings set status = 'attended' where id = $1`, [booking]);
  await q(`update public.class_sessions set date = public.manila_today() - 7 where id = $1`, [S1]);
  r = await t.attempt('A', 'select public.deactivate_my_account()');
  check('Deactivate with a running seat hold', 'refused, names the hold', !r.ok && /seat on hold/.test(r.err), r.err ?? 'ALLOWED');

  // The hold ends: nothing blocks it now
  await q(`update public.bookings set status = 'expired' where id = $1`, [hold.row.booking_id]);
  r = await as('A', 'select public.deactivate_my_account()');
  let s = await state(A);
  check('Deactivate with nothing going on', 'inactive, marked self-deactivated', r.ok && s.is_active === false && s.self === true,
    r.ok ? JSON.stringify(s) : r.err);

  r = await t.attempt('admin', 'select public.deactivate_my_account()');
  check('Staff account uses Deactivate', 'refused', !r.ok && /Staff accounts/.test(r.err), r.err ?? 'ALLOWED');
  check('Admin is still active', 'active', (await state(admin)).is_active === true, JSON.stringify(await state(admin)));

  // ===========================================================================
  t.section('Reactivate: only self-deactivated accounts, only your own');
  // ===========================================================================
  r = await t.attempt('guest', 'select public.reactivate_my_account()');
  check('Guest', 'refused', !r.ok, r.err ?? 'ALLOWED');

  r = await as('A', 'select public.reactivate_my_account() as ok');
  s = await state(A);
  check('A logs back in and confirms', 'active again, flag cleared', r.ok && r.row.ok === true && s.is_active && !s.self,
    r.ok ? JSON.stringify(s) : r.err);
  r = await as('A', 'select public.reactivate_my_account() as ok');
  check('Reactivate an account that is already active', 'true, nothing changes', r.ok && r.row.ok === true, r.err ?? 'ok');

  // The cafe deactivates B (admin Users page): B can't turn it back on
  r = await as('admin', 'select public.admin_set_user_active($1, false)', [B]);
  check('Admin deactivates B', 'inactive, NOT self-deactivated', r.ok && !(await state(B)).is_active && !(await state(B)).self,
    r.ok ? JSON.stringify(await state(B)) : r.err);
  r = await t.attempt('B', 'select public.reactivate_my_account()');
  check('B tries to reactivate', 'refused (turned off by the cafe)', !r.ok && /turned off by the cafe/.test(r.err), r.err ?? 'ALLOWED');
  r = await t.attempt('B', 'update public.profiles set self_deactivated_at = now() where id = $1', [B]);
  check('B sets the flag directly to sneak back in', 'refused (guard trigger)', !r.ok, r.err ?? 'ALLOWED');
  check('B is still off and unflagged', 'inactive, no flag', !(await state(B)).is_active && !(await state(B)).self,
    JSON.stringify(await state(B)));

  // C turns their own account off, then the cafe deactivates it too
  await as('C', 'select public.deactivate_my_account()');
  await as('admin', 'select public.admin_set_user_active($1, false)', [C]);
  s = await state(C);
  check('Admin deactivates an account the client had turned off', 'flag cleared (the cafe decides now)', !s.is_active && !s.self,
    JSON.stringify(s));
  r = await t.attempt('C', 'select public.reactivate_my_account()');
  check('C tries to reactivate', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await as('admin', 'select public.admin_set_user_active($1, true)', [C]);
  check('Admin reactivates C', 'active', r.ok && (await state(C)).is_active === true, r.err ?? JSON.stringify(await state(C)));

  // An active client can't set the flag on themselves either
  r = await t.attempt('A', 'update public.profiles set self_deactivated_at = now() where id = $1', [A]);
  check('Active client sets the flag directly', 'refused', !r.ok, r.err ?? 'ALLOWED');

  // A deleted account can't come back
  await as('A', 'select public.deactivate_my_account()');
  await q(`update public.profiles set deleted_at = now() where id = $1`, [A]);
  r = await t.attempt('A', 'select public.reactivate_my_account()');
  check('Deleted account tries to reactivate', 'refused', !r.ok, r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Home: the mat rental card');
  // ===========================================================================
  const matNote = () => one(`select body from public.site_content where page = 'home' and section = 'mat_note'`);
  check('New mat rental text', 'Mat rental is {mat_price}, ... Taguig.',
    (await matNote()).body === 'Mat rental is {mat_price}, and 100% goes to feeding stray animals in Taguig.', (await matNote()).body);
  await q(`update public.site_content set body = 'Our own mat words' where page = 'home' and section = 'mat_note'`);
  let again;
  try {
    await t.db.query(fs.readFileSync(V14_FILE, 'utf8'));
    again = { ok: true };
  } catch (e) {
    again = { ok: false, err: e.message };
  }
  check('Run the migration again after an admin edit', 'no error, edit kept',
    again.ok && (await matNote()).body === 'Our own mat words', again.ok ? (await matNote()).body : again.err);
}
