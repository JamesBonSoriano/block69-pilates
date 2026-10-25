// Tests for migration 20 (..._v14_admin_users.sql), Version 1.4 admin part 2:
//   - a client can't read the communications log or send messages (or use
//     any of the new admin functions); guests can't either
//   - the admin can start a message, finish it once, and read the log
//   - a confirmation needs one of the client's own confirmed bookings
//   - Edit user saves name, mobile, Instagram, birthday with the sign-up rules,
//     never touches the email or role, and refuses admin accounts
//   - the Users list sorts (A-Z, newest) and pages; View user adds up the totals
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.4 admin: Users, Edit user, Communications';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one, as, attempt, users, sessionIn, confirmedBooking } = t;
  for (const key of ['A', 'B', 'C']) await t.addUser(key);
  await t.addUser('admin', { admin: true });
  const { A, B, admin } = users;

  // Starts a message as someone (kept if it works).
  // Takes: who, the client id, kind, subject, body and an optional booking id.
  // Gives back: the as() result (row has message_id, to_email, full_name).
  const start = (actor, userId, kind, subject, body, bookingId = null) =>
    as(actor, 'select * from public.admin_start_message($1, $2, $3, $4, $5)', [userId, kind, subject, body, bookingId]);

  // ===========================================================================
  t.section('Clients and guests are refused');
  // ===========================================================================
  // A message about A, written straight into the table (as the owner)
  await q(`insert into public.communications (user_id, kind, to_email, subject, body, status)
           values ($1, 'message', 'a@test.example', 'Hello', 'Hi A', 'sent')`, [A]);

  let r = await attempt('A', 'select * from public.communications');
  check('Client reads the communications log', 'sees nothing (not even messages to them)',
    r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);
  r = await attempt('guest', 'select * from public.communications');
  check('Guest reads the communications log', 'refused', !r.ok, r.ok ? `${r.rows.length} rows` : r.err);
  r = await attempt('A', `insert into public.communications (user_id, kind, to_email, subject, body)
                          values ($1, 'message', 'b@test.example', 'Hi', 'Spam')`, [B]);
  check('Client writes into the log directly', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('A', `update public.communications set subject = 'Changed'`);
  check('Client changes the log', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('A', `delete from public.communications`);
  check('Client deletes from the log', 'refused', !r.ok, r.err ?? 'ALLOWED');

  r = await attempt('A', `select * from public.admin_start_message($1, 'message', 'Hi', 'Hello')`, [B]);
  check('Client sends a message (admin_start_message)', 'refused, "Only admins"',
    !r.ok && r.err.includes('Only admins'), r.err ?? 'ALLOWED');
  const logged = (await one('select id from public.communications limit 1')).id;
  // Put it back to 'sending' so only the admin check can stop the client
  await q(`update public.communications set status = 'sending' where id = $1`, [logged]);
  r = await attempt('A', 'select public.admin_finish_message($1, true)', [logged]);
  check('Client marks a message sent (admin_finish_message)', 'refused', !r.ok && r.err.includes('Only admins'), r.err ?? 'ALLOWED');
  await q(`update public.communications set status = 'sent' where id = $1`, [logged]);

  for (const [name, sql, params] of [
    ['admin_update_user', `select public.admin_update_user($1, 'Hacked', '09170000000', null, null)`, [B]],
    ['admin_get_user', 'select * from public.admin_get_user($1)', [B]],
    ['admin_user_bookings', 'select * from public.admin_user_bookings($1)', [B]],
    ['admin_list_users', `select * from public.admin_list_users(p_sort => 'newest')`, []],
  ]) {
    r = await attempt('C', sql, params);
    check(`Client calls ${name}`, 'refused', !r.ok && r.err.includes('Only admins'), r.err ?? 'ALLOWED');
  }
  r = await attempt('guest', `select * from public.admin_start_message($1, 'message', 'Hi', 'Hello')`, [B]);
  check('Guest calls admin_start_message', 'refused', !r.ok, r.err ?? 'ALLOWED');

  // ===========================================================================
  t.section('Messages');
  // ===========================================================================
  r = await start('admin', A, 'message', '  Class reminder ', 'See you Thursday!');
  const msg = r.row;
  check('Admin starts a message to A', 'logged, A\'s email given back',
    r.ok && msg.to_email === 'a@test.example' && msg.full_name === 'Test A', r.err ?? JSON.stringify(msg));
  let row = await one('select * from public.communications where id = $1', [msg?.message_id]);
  check('The new log row', "status 'sending', subject trimmed, sent_by = the admin",
    row?.status === 'sending' && row.subject === 'Class reminder' && row.sent_by === admin, JSON.stringify(row));

  r = await as('admin', 'select public.admin_finish_message($1, true)', [msg?.message_id]);
  row = await one('select status, finished_at from public.communications where id = $1', [msg?.message_id]);
  check('Admin marks it sent', "'sent' with a time", r.ok && row.status === 'sent' && row.finished_at, r.err ?? row.status);
  r = await attempt('admin', `select public.admin_finish_message($1, false, 'late')`, [msg?.message_id]);
  check('Finish it a second time', 'refused (history can\'t change)', !r.ok && r.err.includes('already finished'), r.err ?? 'ALLOWED');

  const failed = (await start('admin', A, 'message', 'Second', 'Body')).row;
  await as('admin', `select public.admin_finish_message($1, false, 'Gmail said no')`, [failed?.message_id]);
  row = await one('select status, error from public.communications where id = $1', [failed?.message_id]);
  check('A failed send', "'failed' with the reason", row.status === 'failed' && row.error === 'Gmail said no', JSON.stringify(row));

  r = await attempt('admin', 'select * from public.communications where user_id = $1', [A]);
  check('Admin reads A\'s history', '3 messages', r.ok && r.rows.length === 3, r.ok ? `${r.rows.length} rows` : r.err);

  for (const [name, args, pattern] of [
    ['Empty subject', [A, 'message', '   ', 'Body'], /subject/],
    ['Empty message', [A, 'message', 'Subject', ''], /type a message/],
    ['Subject over 150 characters', [A, 'message', 'x'.repeat(151), 'Body'], /150/],
    ['Message over 5000 characters', [A, 'message', 'Hi', 'x'.repeat(5001)], /5000/],
    ['A made-up kind', [A, 'newsletter', 'Hi', 'Body'], /message or a booking confirmation/],
    ['To an admin account', [admin, 'message', 'Hi', 'Body'], /client accounts/],
    ['To an account that doesn\'t exist', ['00000000-0000-4000-8000-000000000000', 'message', 'Hi', 'Body'], /couldn't find/],
  ]) {
    r = await attempt('admin', 'select * from public.admin_start_message($1, $2, $3, $4)', args);
    check(name, 'refused', !r.ok && pattern.test(r.err), r.err ?? 'ALLOWED');
  }

  // ===========================================================================
  t.section('Resend confirmation');
  // ===========================================================================
  const later = await sessionIn(48);
  const aBooking = await confirmedBooking(later, 'A');
  const bBooking = await confirmedBooking(later, 'B');
  r = await attempt('admin', `select * from public.admin_start_message($1, 'confirmation', 'You are booked', 'Details')`, [A]);
  check('Confirmation without a booking', 'refused', !r.ok && /which booking/.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('admin', `select * from public.admin_start_message($1, 'confirmation', 'You are booked', 'Details', $2)`, [A, bBooking]);
  check('Confirmation for someone else\'s booking', 'refused', !r.ok && /doesn't belong/.test(r.err), r.err ?? 'ALLOWED');
  r = await start('admin', A, 'confirmation', 'You are booked', 'Details', aBooking);
  check('Confirmation for A\'s confirmed booking', 'logged with the booking', r.ok, r.err);
  await q(`update public.bookings set status = 'forfeited' where id = $1`, [aBooking]);
  r = await attempt('admin', `select * from public.admin_start_message($1, 'confirmation', 'You are booked', 'Details', $2)`, [A, aBooking]);
  check('Confirmation for a forfeited booking', 'refused', !r.ok && /confirmed booking/.test(r.err), r.err ?? 'ALLOWED');
  await q(`update public.bookings set status = 'confirmed' where id = $1`, [aBooking]);

  // ===========================================================================
  t.section('Edit user');
  // ===========================================================================
  const update = (actor, userId, name, mobile, instagram, birthday) =>
    attempt(actor, 'select public.admin_update_user($1, $2, $3, $4, $5)', [userId, name, mobile, instagram, birthday]);
  r = await as('admin', 'select public.admin_update_user($1, $2, $3, $4, $5)',
    [B, '  Bianca   Reyes ', '0918 555-0000', '@bianca.r', '1998-03-12']);
  row = await one('select full_name, mobile, instagram, birthday::text as b, email, role from public.profiles where id = $1', [B]);
  check('Admin saves B\'s details', 'name squashed, mobile digits only, Instagram without @',
    r.ok && row.full_name === 'Bianca Reyes' && row.mobile === '09185550000' && row.instagram === 'bianca.r' && row.b === '1998-03-12',
    r.err ?? JSON.stringify(row));
  check('Email and role', 'unchanged', row.email === 'b@test.example' && row.role === 'client', `${row.email} ${row.role}`);

  for (const [name, args, pattern] of [
    ['Mobile with 10 digits', [B, 'Bianca', '0918555000', null, null], /11-digit/],
    ['Mobile starting with +63', [B, 'Bianca', '+639185550000', null, null], /11-digit/],
    ['Empty name', [B, '   ', '09185550000', null, null], /full name/],
    ['Instagram with spaces', [B, 'Bianca', '09185550000', 'bad name', null], /Instagram/],
    ['Birthday in the future', [B, 'Bianca', '09185550000', null, '2999-01-01'], /past/],
    ['Birthday before 1900', [B, 'Bianca', '09185550000', null, '1899-12-31'], /past/],
    ['An admin account', [admin, 'Boss', '09185550000', null, null], /client accounts/],
  ]) {
    r = await update('admin', ...args);
    check(name, 'refused', !r.ok && pattern.test(r.err), r.err ?? 'ALLOWED');
  }
  await q(`update public.profiles set deleted_at = now() where id = $1`, [users.C]);
  r = await update('admin', users.C, 'Carla', '09185550000', null, null);
  check('A deleted account', 'refused', !r.ok && /deleted/.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('admin', `select * from public.admin_start_message($1, 'message', 'Hi', 'Body')`, [users.C]);
  check('Message to a deleted account', 'refused', !r.ok && /couldn't find/.test(r.err), r.err ?? 'ALLOWED');
  await q(`update public.profiles set deleted_at = null where id = $1`, [users.C]);

  // ===========================================================================
  t.section('Users list, View user');
  // ===========================================================================
  // Make the accounts' ages clear: A oldest, then B, then C
  await q(`update public.profiles set created_at = now() - interval '3 days' where id = $1`, [A]);
  await q(`update public.profiles set created_at = now() - interval '2 days' where id = $1`, [B]);
  await q(`update public.profiles set created_at = now() - interval '1 day'  where id = $1`, [users.C]);
  let rows = (await attempt('admin', `select * from public.admin_list_users(p_role => 'client', p_sort => 'newest')`)).rows;
  check('Clients, newest first', 'C, B, A', rows.map((x) => x.user_id).join() === [users.C, B, A].join(),
    rows.map((x) => x.full_name).join(', '));
  rows = (await attempt('admin', `select * from public.admin_list_users(p_role => 'client', p_limit => 2, p_offset => 2)`)).rows;
  check('Page 2 of 2 per page, A-Z', 'only Test C, total 3', rows.length === 1 && rows[0].user_id === users.C && rows[0].total_matches === 3,
    rows.map((x) => `${x.full_name} (${x.total_matches})`).join(', '));
  r = await attempt('admin', `select * from public.admin_list_users(p_sort => 'oldest')`);
  check('A made-up sort', 'refused', !r.ok, r.err ?? 'ALLOWED');

  // A: one class that already happened (attended, paid 550, with mat) and
  // the confirmed one in 2 days (paid 500, no mat)
  const past = await confirmedBooking(await sessionIn(-30), 'A');
  await q(`update public.bookings set status = 'attended' where id = $1`, [past]);
  await t.pay(past, 550);
  await q(`update public.bookings set mat_rental = false, mat_fee = 0, total = 500 where id = $1`, [aBooking]);
  await t.pay(aBooking, 500);
  // An expired hold doesn't count anywhere
  const expired = await confirmedBooking(await sessionIn(72), 'A');
  await q(`update public.bookings set status = 'expired' where id = $1`, [expired]);

  const details = (await attempt('admin', 'select * from public.admin_get_user($1)', [A])).row;
  check('View user: counts', '2 sessions, 1 attended, 1 upcoming, 1 mat rental',
    details?.sessions_booked === 2 && details.sessions_attended === 1 && details.upcoming === 1 && details.mat_rentals === 1,
    JSON.stringify(details && [details.sessions_booked, details.sessions_attended, details.upcoming, details.mat_rentals]));
  check('View user: money', '2 payments, 1050 spent', details?.payments_count === 2 && Number(details.total_spent) === 1050,
    `${details?.payments_count} payments, ${details?.total_spent}`);
  check('View user: last and next class', 'both set', details?.last_class_date && details?.next_class_date,
    `${details?.last_class_date} / ${details?.next_class_date}`);
  r = await attempt('admin', 'select * from public.admin_get_user(gen_random_uuid())');
  check('View user for an id that doesn\'t exist', 'no rows', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);

  rows = (await attempt('admin', 'select * from public.admin_user_bookings($1)', [A])).rows;
  check('A\'s recent bookings', '2 (no expired hold), newest class first, with paid amounts',
    rows.length === 2 && rows[0].booking_id === aBooking && Number(rows[0].paid_amount) === 500 && rows[1].class_ended === true,
    rows.map((x) => `${x.status} ${x.paid_amount}`).join(', '));
}
