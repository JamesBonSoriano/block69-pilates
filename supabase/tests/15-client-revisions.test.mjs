// Tests for migration 12 (Revisions part 1, the client side):
//   - sign-up saves the birthday (and ignores a broken or future one)
//   - clients can't change their email, and can save their birthday only once
//     (admins and our server code still can)
//   - notifications: each booking change makes the right update, for the
//     right person, through the REAL functions (cancel, transfer, approve,
//     cancel a class); walk-ins without an account get nothing
//   - a client can only ever see, count and mark their OWN notifications;
//     nobody can add, change or delete rows from the website; guests get nothing
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Client revisions: birthday, locked fields, notifications (migration 12)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, attempt, sessionIn, confirmedBooking, users } = t;
  for (const key of ['A', 'B']) await t.addUser(key);
  await t.addUser('admin', { admin: true });
  const S = await t.emptySessions(3);

  // Small helpers.
  // Someone's notifications, as the Notifications page asks for them.
  const myList = async (actor) => (await attempt(actor, 'select * from public.get_my_notifications()')).rows ?? [];
  // Every notification about one booking (as the owner, skipping RLS).
  const kindsFor = async (bookingId) =>
    (await q('select kind from public.notifications where booking_id = $1 order by created_at, kind', [bookingId]))
      .map((x) => x.kind);
  // Pretends Supabase Auth made a new user. Gives back their profile's birthday.
  async function signUp(email, metadata) {
    const id = crypto.randomUUID();
    await one('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, metadata]);
    const p = await one('select birthday::text as birthday from public.profiles where id = $1', [id]);
    return p?.birthday ?? null;
  }

  // ===========================================================================
  t.section('Sign-up saves the birthday');
  // ===========================================================================
  let b = await signUp('bday1@test.example', { full_name: 'Bday One', mobile: '0917 000 0001', birthday: '1999-05-20' });
  check('Birthday from the sign-up form', '1999-05-20', b === '1999-05-20', b);
  b = await signUp('bday2@test.example', { full_name: 'Bday Two', birthday: '2026-02-31' });
  check('Impossible date (31 February)', 'left empty, sign-up still works', b === null, b);
  b = await signUp('bday3@test.example', { full_name: 'Bday Three', birthday: '2999-01-01' });
  check('Birthday in the future', 'left empty', b === null, b);
  b = await signUp('bday4@test.example', { full_name: 'Bday Four', birthday: 'not a date' });
  check('Text that is not a date', 'left empty', b === null, b);
  b = await signUp('bday5@test.example', { full_name: 'Bday Five' });
  check('No birthday sent (e.g. Google login)', 'left empty', b === null, b);

  // ===========================================================================
  t.section('Locked profile fields');
  // ===========================================================================
  const A = users.A;
  let r = await attempt('A', `update public.profiles set full_name = 'New Name', mobile = '0918 111 2222', instagram = 'newig' where id = $1`, [A]);
  check('Client edits name, mobile and Instagram', 'allowed', r.ok, r.ok ? 'allowed' : r.err);
  r = await attempt('A', `update public.profiles set email = 'other@test.example' where id = $1`, [A]);
  check('Client changes their own email', 'refused', !r.ok && /message the cafe/.test(r.err), r.ok ? 'allowed!' : r.err);
  r = await attempt('A', `update public.profiles set birthday = current_date + 5 where id = $1`, [A]);
  check('Client sets a birthday in the future', 'refused', !r.ok && /real date/.test(r.err), r.ok ? 'allowed!' : r.err);
  r = await as('A', `update public.profiles set birthday = '2000-01-15' where id = $1`, [A]);
  check('Client saves a birthday for the first time', 'allowed', r.ok, r.ok ? 'allowed' : r.err);
  r = await attempt('A', `update public.profiles set birthday = '2001-01-15' where id = $1`, [A]);
  check('Client changes a saved birthday', 'refused', !r.ok && /already saved/.test(r.err), r.ok ? 'allowed!' : r.err);
  r = await attempt('A', `update public.profiles set birthday = null where id = $1`, [A]);
  check('Client clears a saved birthday', 'refused', !r.ok && /already saved/.test(r.err), r.ok ? 'allowed!' : r.err);
  r = await attempt('A', `update public.profiles set email_reminders = false where id = $1`, [A]);
  check('Client still changes other settings (reminder switch)', 'allowed', r.ok, r.ok ? 'allowed' : r.err);
  r = await attempt('admin', `update public.profiles set birthday = '2001-01-15', email = 'a2@test.example' where id = $1`, [A]);
  check('Admin fixes a client\'s birthday and email', 'allowed', r.ok, r.ok ? 'allowed' : r.err);
  r = await attempt('server', `update public.profiles set email = 'a3@test.example' where id = $1`, [A]);
  check('Server code (secret key) changes an email', 'allowed', r.ok, r.ok ? 'allowed' : r.err);
  const bday = await one('select birthday::text as b from public.profiles where id = $1', [A]);
  check('Birthday after the refused changes', '2000-01-15', bday.b === '2000-01-15', bday.b);

  // ===========================================================================
  t.section('Notifications are made for each booking change');
  // ===========================================================================
  // Paid and confirmed (here added straight in, like the webhook's end result)
  const W30 = await confirmedBooking(await sessionIn(30), 'A');
  check('Confirmed booking', 'booking_confirmed', (await kindsFor(W30)).join() === 'booking_confirmed', (await kindsFor(W30)).join());

  // An unpaid hold through book_seat: nothing yet
  const hold = (await t.book('A', S[0])).row.booking_id;
  check('Unpaid seat hold', 'no update', (await kindsFor(hold)).length === 0, (await kindsFor(hold)).join() || 'none');

  // Manual transfer sent, then approved by the admin (the real function)
  await q(`update public.bookings set status = 'awaiting_verification' where id = $1`, [hold]);
  const manualPay = (await one(`insert into public.payments (booking_id, provider, method, amount, screenshot_path)
    values ($1, 'manual', 'gcash', 500, 'a/shot.png') returning id`, [hold])).id;
  r = await as('admin', 'select public.admin_review_manual_payment($1, true) as s', [manualPay]);
  check('Transfer sent, then approved by the admin', 'payment_checking, payment_approved',
    r.ok && (await kindsFor(hold)).join() === 'payment_checking,payment_approved', r.ok ? (await kindsFor(hold)).join() : r.err);

  // Manual transfer rejected
  const hold2 = (await t.book('B', S[1])).row.booking_id;
  await q(`update public.bookings set status = 'awaiting_verification' where id = $1`, [hold2]);
  const manualPay2 = (await one(`insert into public.payments (booking_id, provider, method, amount, screenshot_path)
    values ($1, 'manual', 'bpi', 500, 'b/shot.png') returning id`, [hold2])).id;
  r = await as('admin', 'select public.admin_review_manual_payment($1, false) as s', [manualPay2]);
  check('Transfer rejected by the admin', 'payment_checking, payment_rejected',
    r.ok && (await kindsFor(hold2)).join() === 'payment_checking,payment_rejected', r.ok ? (await kindsFor(hold2)).join() : r.err);

  // Late payment into a full class
  const late = (await t.book('B', S[2])).row.booking_id;
  await q(`update public.bookings set status = 'paid_needs_action' where id = $1`, [late]);
  check('Paid late (cafe will contact them)', 'payment_needs_action',
    (await kindsFor(late)).join() === 'payment_needs_action', (await kindsFor(late)).join());

  // Cancel 18 hours before: a 50% code, and the update carries THAT code
  const W18 = await confirmedBooking(await sessionIn(18), 'A');
  r = await as('A', 'select * from public.cancel_my_booking($1)', [W18]);
  const vNote = await one(`select voucher_code from public.notifications where booking_id = $1 and kind = 'cancelled_with_voucher'`, [W18]);
  check('Cancelled 12 to 24 hours before', 'cancelled_with_voucher with the same 50% code',
    r.ok && vNote?.voucher_code && vNote.voucher_code === r.row.voucher_code, r.ok ? `${vNote?.voucher_code} vs ${r.row.voucher_code}` : r.err);

  // Cancel 6 hours before: no credit
  const W6 = await confirmedBooking(await sessionIn(6), 'A');
  r = await as('A', 'select * from public.cancel_my_booking($1)', [W6]);
  check('Cancelled less than 12 hours before', 'booking_forfeited',
    r.ok && (await kindsFor(W6)).includes('booking_forfeited'), r.ok ? (await kindsFor(W6)).join() : r.err);

  // Transfer more than 24 hours before: the NEW booking gets the update
  r = await as('A', 'select public.transfer_my_booking($1, $2) as id', [W30, S[3]]);
  const moved = r.row?.id;
  check('Transfer done', 'booking_transferred on the new booking, nothing new on the old one',
    r.ok && (await kindsFor(moved)).join() === 'booking_transferred' && (await kindsFor(W30)).join() === 'booking_confirmed',
    r.ok ? `new: ${(await kindsFor(moved)).join()}; old: ${(await kindsFor(W30)).join()}` : r.err);

  // The cafe cancels a class: everyone holding a seat is told, others aren't
  const cls = S[4];
  const seated = await confirmedBooking(cls, 'B');
  const ended = (await one(`
    insert into public.bookings (session_id, user_id, status, class_fee, total, not_pregnant_confirmed, agreed_at, hold_expires_at)
    values ($1, $2, 'pending_payment', 500, 500, true, now(), now() - interval '1 minute') returning id`, [cls, users.A])).id;
  r = await as('admin', 'select public.admin_cancel_session($1) as n', [cls]);
  check('Cafe cancels a class', 'class_cancelled for the seated client only (not an ended hold)',
    r.ok && (await kindsFor(seated)).includes('class_cancelled') && (await kindsFor(ended)).length === 0,
    r.ok ? `seated: ${(await kindsFor(seated)).join()}; ended hold: ${(await kindsFor(ended)).join() || 'none'}` : r.err);

  // A walk-in without an account: nobody to tell
  const walkin = (await one(`
    insert into public.bookings (session_id, walkin_name, walkin_contact, status, class_fee, total, not_pregnant_confirmed, agreed_at)
    values ($1, 'Walk In', '0917 000 0000', 'confirmed', 500, 500, true, now()) returning id`, [S[5]])).id;
  check('Walk-in without an account', 'no update', (await kindsFor(walkin)).length === 0, (await kindsFor(walkin)).join() || 'none');

  // A change that isn't a status change (e.g. the drink): nothing new
  const before = (await kindsFor(seated)).length;
  await q(`update public.bookings set drink_choice = 'Hot Latte' where id = $1`, [seated]);
  check('Only the drink changes', 'no new update', (await kindsFor(seated)).length === before, (await kindsFor(seated)).join());

  // ===========================================================================
  t.section('Each client only ever sees their own notifications');
  // ===========================================================================
  const total = async (who) => (await one('select count(*)::int as n from public.notifications where user_id = $1', [users[who]])).n;
  const aList = await myList('A');
  check('A\'s list', 'all of A\'s updates, none of B\'s',
    aList.length === await total('A') && aList.length > 0, `${aList.length} rows (A has ${await total('A')})`);
  check('A\'s list is newest first, with the class date', 'newest first, class date filled in',
    aList.every((n, i) => i === 0 || n.created_at <= aList[i - 1].created_at) && aList.some((n) => n.class_date),
    aList.map((n) => n.kind).join(', '));
  const bList = await myList('B');
  check('B\'s list (a client can\'t see another client\'s notifications)', 'none of A\'s rows',
    bList.length === await total('B') && !bList.some((n) => aList.some((a) => a.id === n.id)),
    `${bList.length} rows`);
  r = await attempt('B', 'select id from public.notifications where user_id = $1', [users.A]);
  check('B reads A\'s rows straight from the table', 'sees nothing', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);
  r = await attempt('admin', 'select id from public.notifications');
  check('Admin reads the table', 'only their own (none)', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);
  r = await attempt('guest', 'select id from public.notifications');
  check('Guest reads the table', 'refused', !r.ok, r.ok ? `${r.rows.length} rows` : r.err);
  r = await attempt('guest', 'select * from public.get_my_notifications()');
  check('Guest asks for a list', 'refused', !r.ok, r.ok ? 'allowed!' : r.err);

  // Nobody can make, change or delete rows from the website
  r = await attempt('A', `insert into public.notifications (user_id, kind) values ($1, 'booking_confirmed')`, [users.A]);
  check('Client adds a notification', 'refused', !r.ok, r.ok ? 'allowed!' : r.err);
  r = await attempt('B', `insert into public.notifications (user_id, kind) values ($1, 'class_cancelled')`, [users.A]);
  check('Client adds a fake notification for someone else', 'refused', !r.ok, r.ok ? 'allowed!' : r.err);
  r = await attempt('A', 'update public.notifications set read_at = now() where user_id = $1', [users.A]);
  check('Client updates rows directly', 'refused', !r.ok, r.ok ? 'allowed!' : r.err);
  r = await attempt('A', 'delete from public.notifications where user_id = $1', [users.A]);
  check('Client deletes rows', 'refused', !r.ok, r.ok ? 'allowed!' : r.err);

  // ===========================================================================
  t.section('Unread count and marking as read');
  // ===========================================================================
  const unread = async (who) => (await attempt(who, 'select public.my_unread_notification_count() as n')).row?.n;
  const aUnread = await unread('A');
  check('A\'s unread count', `${await total('A')} (all new)`, aUnread === await total('A'), aUnread);
  r = await as('A', 'select public.mark_my_notifications_read() as n');
  check('A opens Notifications (mark as read)', `${aUnread} marked`, r.ok && r.row.n === aUnread, r.ok ? r.row.n : r.err);
  check('A\'s unread count afterwards', '0', (await unread('A')) === 0, await unread('A'));
  check('B\'s unread count is untouched', `${await total('B')}`, (await unread('B')) === await total('B'), await unread('B'));
  r = await as('A', 'select public.mark_my_notifications_read() as n');
  check('Marking again', '0 marked', r.ok && r.row.n === 0, r.ok ? r.row.n : r.err);
  r = await attempt('guest', 'select public.mark_my_notifications_read()');
  check('Guest marks as read', 'refused', !r.ok, r.ok ? 'allowed!' : r.err);
}
