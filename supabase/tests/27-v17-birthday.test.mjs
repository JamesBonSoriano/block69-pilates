// Tests for migration 25 (..._v17_birthday.sql), Version 1.7 Prompt C.
//   - Age 18 to 100: a new or changed birthday that makes someone older than
//     100 (Philippine date) is refused by the database, on My Profile,
//     sign-up and admin Edit user; exactly 100 is still allowed; the 18+
//     rule from migration 23 still works; an old row with a 101+ birthday
//     still saves when only other details change
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.7: birthday age limit 18 to 100';

// The message the database (and website) shows for an age over 100.
const TOO_OLD = /age limit is 100/;
// The message for an age under 18 (migration 23, unchanged).
const TOO_YOUNG = /at least 18 years old/;

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, as, attempt } = t;
  for (const key of ['A', 'B', 'C']) await t.addUser(key);
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

  const turns101Today = await yearsAgo(101);     // 101 today: too old
  const turns101Tomorrow = await yearsAgo(101, 1); // still 100 today: allowed
  const under18 = await yearsAgo(17);

  // ===========================================================================
  t.section('Age limit 100 (My Profile)');
  // ===========================================================================
  let r = await attempt('A', `update public.profiles set birthday = $1 where id = auth.uid()`, [turns101Today]);
  check('Client who turns 101 today', 'refused with the 100 limit message', !r.ok && TOO_OLD.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('A', `update public.profiles set birthday = '1900-01-01' where id = auth.uid()`);
  check('Client sets 01/01/1900', 'refused (over 100)', !r.ok && TOO_OLD.test(r.err), r.err ?? 'ALLOWED');
  r = await as('A', `update public.profiles set birthday = $1 where id = auth.uid()`, [turns101Tomorrow]);
  check('Client who is exactly 100 (101 tomorrow)', 'allowed', r.ok && (await birthday('A')) === turns101Tomorrow, r.err ?? (await birthday('A')));
  r = await attempt('A', `update public.profiles set birthday = $1 where id = auth.uid()`, [under18]);
  check('18+ rule still works', 'refused with the 18+ message', !r.ok && TOO_YOUNG.test(r.err), r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Age limit 100 (sign-up and admin Edit user)');
  // ===========================================================================
  let signupErr = null;
  try {
    await t.db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'old@test.example', $1)`,
      [{ full_name: 'Very Old', mobile: '09171234567', birthday: turns101Today }]);
  } catch (e) {
    signupErr = e.message;
  }
  check('Sign-up with a birthday 101 years ago', 'refused with the 100 limit message', TOO_OLD.test(signupErr ?? ''), signupErr ?? 'ALLOWED');

  await t.db.query(`update public.profiles set mobile = '09171234567', birthday = '1990-01-01' where id = $1`, [t.users.B]);
  r = await attempt('admin', `select public.admin_update_user($1, 'Test B', '09171234567', '', $2)`, [t.users.B, turns101Today]);
  check('Admin Edit user: birthday 101 years ago', 'refused with the 100 limit message', !r.ok && TOO_OLD.test(r.err), r.err ?? 'ALLOWED');
  r = await as('admin', `select public.admin_update_user($1, 'Test B', '09171234567', '', '1985-05-05')`, [t.users.B]);
  check('Admin Edit user: adult birthday', 'allowed', r.ok && (await birthday('B')) === '1985-05-05', r.err);

  // ===========================================================================
  t.section('Old rows are left alone');
  // ===========================================================================
  // An OLD row saved before this rule (trigger off for a moment)
  await t.db.query(`alter table public.profiles disable trigger profiles_zz_check_birthday_age`);
  await t.db.query(`update public.profiles set birthday = '1900-11-05', mobile = '09171234567' where id = $1`, [t.users.C]);
  await t.db.query(`alter table public.profiles enable trigger profiles_zz_check_birthday_age`);
  r = await as('C', `update public.profiles set mobile = '09181234567' where id = auth.uid()`);
  check('Old 1900 birthday: client changes only the mobile', 'allowed (old rows don\'t break)', r.ok, r.err);
}
