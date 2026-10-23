// Tests for migration 16 (..._r2_account.sql), Change 17, Part G (My Account):
//   - clients may now edit their birthday (a real past date, not emptied)
//   - the email column still can't be changed directly
//   - a confirmed new login email is copied into profiles.email
//   - Delete account: what blocks it, what it blanks, who may do it, and that
//     the bookings and payments of a deleted account are kept
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Change 17: birthday edits, email sync, Delete account';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as } = t;

  const A = await t.addUser('A');
  const B = await t.addUser('B');
  const N = await t.addUser('N'); // never books
  const admin = await t.addUser('admin', { admin: true });
  const profile = (id) =>
    one('select full_name, email, mobile, instagram, birthday::text, is_active, deleted_at from public.profiles where id = $1', [id]);

  // ===========================================================================
  t.section('Birthday can be edited, email can\'t (from the website)');
  // ===========================================================================
  await q(`update public.profiles set birthday = '1990-01-01', mobile = '09171234567' where id = $1`, [A]);
  let r = await as('A', `update public.profiles set birthday = '1995-06-15' where id = $1`, [A]);
  check('Client changes their birthday', 'allowed', r.ok && (await profile(A)).birthday === '1995-06-15', r.err ?? (await profile(A)).birthday);
  r = await t.attempt('A', `update public.profiles set birthday = (now() + interval '2 days')::date where id = $1`, [A]);
  check('Birthday in the future', 'refused', !r.ok && /past/i.test(r.err), r.err);
  r = await t.attempt('A', `update public.profiles set birthday = '1899-12-31' where id = $1`, [A]);
  check('Birthday before 1900', 'refused', !r.ok, r.err);
  r = await t.attempt('A', `update public.profiles set birthday = null where id = $1`, [A]);
  check('Emptying the birthday', 'refused', !r.ok && /birthday/i.test(r.err), r.err);
  r = await t.attempt('A', `update public.profiles set email = 'someone@else.example' where id = $1`, [A]);
  check('Changing the email column directly', 'refused (use Change email)', !r.ok && r.err.includes('Change email'), r.err);
  r = await t.attempt('A', `update public.profiles set birthday = '1980-02-02' where id = $1`, [B]);
  check("Changing someone else's birthday", 'nothing changes (RLS)', r.ok ? (await profile(B)).birthday === null : true,
    r.ok ? `B's birthday: ${(await profile(B)).birthday}` : r.err);

  // ===========================================================================
  t.section('A confirmed new login email is copied to the profile');
  // ===========================================================================
  // (Supabase changes auth.users.email only after both codes are entered)
  await q(`update auth.users set email = 'a.new@gmail.com' where id = $1`, [A]);
  check('New login email shows on the profile', 'a.new@gmail.com', (await profile(A)).email === 'a.new@gmail.com', (await profile(A)).email);
  await q(`update auth.users set email = 'scrambled@deleted.example', deleted_at = now() where id = $1`, [B]);
  check('A soft-deleted login is NOT copied', 'b@test.example', (await profile(B)).email === 'b@test.example', (await profile(B)).email);
  await q(`update auth.users set deleted_at = null, email = 'b@test.example' where id = $1`, [B]);

  // ===========================================================================
  t.section('Delete account: what blocks it');
  // ===========================================================================
  const [S1, S2] = await t.emptySessions(3);
  const booking = await t.confirmedBooking(S1, 'A');
  const blockers = async (who) => (await as(who, 'select * from public.my_account_deletion_blockers()')).rows;
  let list = await blockers('A');
  check('An upcoming class blocks it', 'upcoming_class x1', list.length === 1 && list[0].kind === 'upcoming_class' && list[0].how_many === 1,
    JSON.stringify(list));
  r = await t.attempt('A', 'select * from public.close_my_account()');
  check('Delete with an upcoming class', 'refused, says to cancel first', !r.ok && /cancel it in My Bookings/.test(r.err), r.err);

  // A seat on hold blocks it too
  const hold = await t.book('A', S2);
  list = await blockers('A');
  check('A running seat hold blocks it too', 'upcoming_class + seat_on_hold',
    list.map((x) => x.kind).sort().join(' + ') === 'seat_on_hold + upcoming_class', list.map((x) => x.kind).join(' + '));
  check("Someone else's bookings don't block B", 'none', (await blockers('B')).length === 0, JSON.stringify(await blockers('B')));

  // The class goes past (attended) and the hold is let go: nothing blocks it now
  await q(`update public.bookings set status = 'attended' where id = $1`, [booking]);
  await q(`update public.class_sessions set date = public.manila_today() - 7 where id = $1`, [S1]);
  await q(`update public.bookings set status = 'expired' where id = $1`, [hold.row.booking_id]);
  check('Past classes and ended holds don\'t block it', 'none', (await blockers('A')).length === 0, JSON.stringify(await blockers('A')));

  // ===========================================================================
  t.section('Delete account: what it does');
  // ===========================================================================
  await q(`insert into public.vouchers (code, percent_off, owner_id, source, uses_left, expires_at)
           values ('HALF-DELTST', 50, $1, 'cancellation', 1, now() + interval '30 days')`, [A]);
  await q(`insert into public.notifications (user_id, booking_id, kind) values ($1, $2, 'booking_confirmed')`, [A, booking]);
  r = await as('A', 'select * from public.close_my_account()');
  check('A (who has bookings) deletes their account', 'has_bookings = true', r.ok && r.row.has_bookings === true, r.ok ? JSON.stringify(r.row) : r.err);
  const gone = await profile(A);
  check('Profile blanked and deactivated', 'Deleted user, no email/mobile/birthday, inactive',
    gone.full_name === 'Deleted user' && gone.email === '' && gone.mobile === null && gone.birthday === null &&
      gone.is_active === false && gone.deleted_at !== null,
    JSON.stringify(gone));
  const kept = await one('select count(*)::int as n from public.bookings where user_id = $1', [A]);
  check('Their bookings are kept (for the cafe\'s records)', '2 bookings', kept.n === 2, `${kept.n} bookings`);
  const code = await one(`select disabled_at from public.vouchers where code = 'HALF-DELTST'`);
  check('Their 50% code is turned off', 'disabled', code.disabled_at !== null, code.disabled_at);
  const notes = await one('select count(*)::int as n from public.notifications where user_id = $1', [A]);
  check('Their notifications are deleted', '0', notes.n === 0, notes.n);
  // (Supabase's admin API deletes logins as the database owner, like q() here)
  const deleteLogin = async (id) => {
    try {
      await q('delete from auth.users where id = $1', [id]);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  };
  r = await deleteLogin(A);
  check('Their login can\'t be fully deleted (bookings keep the row): soft delete instead', 'refused',
    !r.ok && /violates foreign key/.test(r.err), r.err ?? 'DELETED');

  r = await t.attempt('A', 'select * from public.close_my_account()');
  check('Delete twice', 'refused', !r.ok, r.err);
  r = await t.attempt('admin', 'select public.admin_set_user_active($1, true)', [A]);
  check('Admin tries to reactivate a deleted account', 'refused', !r.ok && /deleted their account/.test(r.err), r.err);
  r = await t.attempt('admin', `select public.admin_set_user_role($1, 'admin')`, [A]);
  check('Admin tries to make a deleted account an admin', 'refused', !r.ok && /deleted their account/.test(r.err), r.err);

  // Someone who never booked
  r = await as('N', 'select * from public.close_my_account()');
  check('N (never booked) deletes their account', 'has_bookings = false', r.ok && r.row.has_bookings === false, r.ok ? JSON.stringify(r.row) : r.err);
  r = await deleteLogin(N);
  const nProfile = await one('select count(*)::int as n from public.profiles where id = $1', [N]);
  check('Their login can be fully deleted (the profile goes with it)', 'deleted, 0 profiles',
    r.ok && nProfile.n === 0, r.ok ? `${nProfile.n} profiles` : r.err);

  // ===========================================================================
  t.section('Delete account: who may do it');
  // ===========================================================================
  r = await t.attempt('guest', 'select * from public.close_my_account()');
  check('Guest', 'refused', !r.ok, r.err);
  r = await t.attempt('admin', 'select * from public.close_my_account()');
  check('Admin (staff) account', 'refused', !r.ok && /Staff accounts/.test(r.err), r.err);
  check('Admin is still active', 'active', (await profile(admin)).is_active === true, String((await profile(admin)).is_active));
}
