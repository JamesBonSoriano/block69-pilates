// Tests for migration 2 (security): Row Level Security policies, table
// permissions, the role/is_active guard, and who may call which function.
// Every action is tried as 5 people: a guest, client A, client B, an admin,
// and our server code (secret key). Each try is undone afterwards.
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Security: who can read and change what (RLS)';

const ACTORS = ['guest', 'A', 'B', 'admin', 'server'];

// Turns 5 true/false answers into words, e.g. "guest no, A yes, B no, admin yes, server yes".
const describe = (answers) => ACTORS.map((a, i) => `${a} ${answers[i] ? 'yes' : 'no'}`).join(', ');

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one } = t;
  const A = await t.addUser('A');
  const B = await t.addUser('B');
  const admin = await t.addUser('admin', { admin: true });

  // --- Sample rows (added as the owner, which skips RLS) -----------------------
  // Two classes 60 days ahead (far from the generated ones): S1 has bookings, S2 is empty.
  const S1 = await t.sessionIn(60 * 24);
  const S2 = await t.sessionIn(61 * 24);
  const bookingA = await t.confirmedBooking(S1, 'A');
  const bookingB = await t.confirmedBooking(S1, 'B');
  const walkIn = (await one(`
    insert into public.bookings (session_id, walkin_name, status, class_fee, total, not_pregnant_confirmed, agreed_at)
    values ($1, 'Walk-in Bea', 'confirmed', 500, 500, true, now()) returning id`, [S1])).id;
  await q(`insert into public.payments (booking_id, provider, method, amount, status, paid_at) values
    ($1, 'paymongo', 'gcash', 550, 'paid', now()), ($2, 'paymongo', 'card', 550, 'paid', now())`, [bookingA, bookingB]);
  await q(`insert into public.vouchers (code, percent_off, owner_id, source, expires_at) values
    ('HALF-AAAA', 50, $1, 'cancellation', now() + interval '60 days'),
    ('HALF-BBBB', 50, $2, 'cancellation', now() + interval '60 days'),
    ('PROMO10', 10, null, 'promo', null)`, [A, B]);
  await q(`insert into public.email_log (user_id, booking_id, type) values ($1, $2, 'confirmation')`, [A, bookingA]);

  // Each row: [section, what we try, the SQL, then 1 (allowed) or 0 (blocked)
  // for guest, A, B, admin, server]. "Allowed" = it worked AND found/changed a row.
  const matrix = [
    ['profiles', 'Read client A profile', `select id from public.profiles where id = '${A}'`, 0, 1, 0, 1, 1],
    ['profiles', 'Edit client A name', `update public.profiles set full_name = 'X' where id = '${A}' returning id`, 0, 1, 0, 1, 1],
    ['profiles', 'Make client A an admin', `update public.profiles set role = 'admin' where id = '${A}' returning id`, 0, 0, 0, 1, 1],
    ['profiles', 'Deactivate client A (is_active)', `update public.profiles set is_active = false where id = '${A}' returning id`, 0, 0, 0, 1, 1],
    ['profiles', 'Delete a profile', `delete from public.profiles where id = '${admin}' returning id`, 0, 0, 0, 0, 1],
    ['schedule', 'Read weekly templates', 'select id from public.schedule_templates', 1, 1, 1, 1, 1],
    ['schedule', 'Add a template', `insert into public.schedule_templates (weekday, start_time, end_time) values (1, '09:00', '09:50') returning id`, 0, 0, 0, 1, 1],
    ['schedule', 'Change templates', 'update public.schedule_templates set default_capacity = 3 returning id', 0, 0, 0, 1, 1],
    ['schedule', 'Read classes', 'select id from public.class_sessions', 1, 1, 1, 1, 1],
    ['schedule', 'Add a class', `insert into public.class_sessions (date, start_time, end_time) values ('2030-01-03', '09:00', '09:50') returning id`, 0, 0, 0, 1, 1],
    ['schedule', 'Change a class capacity', `update public.class_sessions set capacity = 3 where id = '${S1}' returning id`, 0, 0, 0, 1, 1],
    ['schedule', 'Delete an empty class', `delete from public.class_sessions where id = '${S2}' returning id`, 0, 0, 0, 1, 1],
    ['settings', 'Read a public setting (price)', `select key from public.settings where key = 'class_price'`, 1, 1, 1, 1, 1],
    ['settings', 'Read a private setting', `select key from public.settings where key = 'admin_alert_email'`, 0, 0, 0, 1, 1],
    ['settings', 'Change the price', `update public.settings set value = '1' where key = 'class_price' returning key`, 0, 0, 0, 1, 1],
    ['settings', 'Add a setting', `insert into public.settings (key, value) values ('new_one', '1') returning key`, 0, 0, 0, 1, 1],
    ['content', 'Read page content', 'select id from public.site_content', 1, 1, 1, 1, 1],
    ['content', 'Edit page content', `update public.site_content set title = 'Hacked' returning id`, 0, 0, 0, 1, 1],
    ['bookings', "Read client A's booking", `select id from public.bookings where id = '${bookingA}'`, 0, 1, 0, 1, 1],
    ['bookings', "Read client B's booking", `select id from public.bookings where id = '${bookingB}'`, 0, 0, 1, 1, 1],
    ['bookings', 'Read a walk-in booking', `select id from public.bookings where id = '${walkIn}'`, 0, 0, 0, 1, 1],
    ['bookings', 'Add a confirmed booking directly (skipping book_seat)', `insert into public.bookings (session_id, user_id, status, class_fee, total, not_pregnant_confirmed, agreed_at) values ('${S2}', '${A}', 'confirmed', 500, 500, true, now()) returning id`, 0, 0, 0, 1, 1],
    ['bookings', "Change A's booking status", `update public.bookings set status = 'attended' where id = '${bookingA}' returning id`, 0, 0, 0, 1, 1],
    ['bookings', 'Delete a walk-in booking', `delete from public.bookings where id = '${walkIn}' returning id`, 0, 0, 0, 1, 1],
    ['payments', "Read A's payment", `select id from public.payments where booking_id = '${bookingA}'`, 0, 1, 0, 1, 1],
    ['payments', "Read B's payment", `select id from public.payments where booking_id = '${bookingB}'`, 0, 0, 1, 1, 1],
    ['payments', "Add a 'paid' payment for A", `insert into public.payments (booking_id, provider, method, amount, status, paid_at) values ('${bookingA}', 'cash', 'cash', 500, 'paid', now()) returning id`, 0, 0, 0, 1, 1],
    ['payments', "Change A's payment amount", `update public.payments set amount = 1 where booking_id = '${bookingA}' returning id`, 0, 0, 0, 1, 1],
    ['vouchers', "Read A's 50% code", `select id from public.vouchers where code = 'HALF-AAAA'`, 0, 1, 0, 1, 1],
    ['vouchers', "Read B's 50% code", `select id from public.vouchers where code = 'HALF-BBBB'`, 0, 0, 1, 1, 1],
    ['vouchers', 'List promo codes', `select id from public.vouchers where code = 'PROMO10'`, 0, 0, 0, 1, 1],
    ['vouchers', 'Create a promo code', `insert into public.vouchers (code, percent_off, source) values ('FREE100', 100, 'promo') returning id`, 0, 0, 0, 1, 1],
    ['vouchers', "Give A's code more uses", `update public.vouchers set uses_left = 99 where code = 'HALF-AAAA' returning id`, 0, 0, 0, 1, 1],
    ['email_log', 'Read the email log', 'select id from public.email_log', 0, 0, 0, 1, 1],
    ['email_log', 'Add an email log row', `insert into public.email_log (type) values ('reminder') returning id`, 0, 0, 0, 1, 1],
  ];

  for (const [area, label, sql, ...expected] of matrix) {
    t.section(`Table: ${area} (guest / A / B / admin / server)`);
    const got = [];
    for (const actor of ACTORS) {
      const r = await t.attempt(actor, sql);
      got.push(r.ok && r.rows.length > 0);
    }
    check(label, describe(expected.map(Boolean)), got.every((g, i) => g === Boolean(expected[i])), describe(got));
  }

  // ===========================================================================
  t.section('Role and account guards');
  // ===========================================================================
  const isAdmin = [];
  for (const actor of ACTORS.slice(0, 4)) isAdmin.push((await t.attempt(actor, 'select public.is_admin() as yes')).row?.yes === true);
  check('is_admin() is true only for the admin', 'guest no, A no, B no, admin yes',
    isAdmin.join() === 'false,false,false,true', ACTORS.slice(0, 4).map((a, i) => `${a} ${isAdmin[i] ? 'yes' : 'no'}`).join(', '));

  let r = await t.attempt('A', `update public.profiles set role = 'admin' where id = '${A}'`);
  check('Client makes themself admin', 'refused with an error', !r.ok && r.err.includes('Only an admin'), r.err);

  r = await t.attempt('A', `update public.profiles set id = '${B}' where id = '${A}' returning id`);
  check("Client changes their profile id to B's", 'refused', !(r.ok && r.rows.length), r.ok ? `${r.rows.length} rows changed` : r.err);

  // An admin who gets deactivated loses admin rights straight away.
  await q('update public.profiles set is_active = false where id = $1', [admin]);
  r = await t.attempt('admin', 'select id from public.bookings');
  check('Deactivated admin reads bookings', 'sees nothing', r.ok && r.rows.length === 0, r.ok ? `${r.rows.length} rows` : r.err);
  await q('update public.profiles set is_active = true where id = $1', [admin]);

  // ===========================================================================
  t.section('Database-wide checks');
  // ===========================================================================
  const tables = await q(`
    select c.relname as name, c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    order by 1`);
  const weak = tables.filter((x) => !x.rls || x.policies === 0);
  // (11 = the 9 from migration 1 + booking_admin_actions from migration 10
  // + notifications from migration 12 + communications from migration 20)
  check('RLS is on, with policies, for every table', '12 tables, all protected',
    tables.length === 12 && weak.length === 0,
    `${tables.length} tables` + (weak.length ? `; NOT protected: ${weak.map((x) => x.name).join(', ')}` : ', all protected'));

  // Which of our functions each browser role may call. (Trigger functions are
  // left out: nobody can call those directly anyway.)
  const callable = async (role) => (await q(`
    select p.proname as name from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege($1, p.oid, 'execute')
    order by 1`, [role])).map((x) => x.name);
  const guestFns = await callable('anon');
  check('Functions a guest can call', 'get_open_sessions, is_admin, seats_left',
    guestFns.join(', ') === 'get_open_sessions, is_admin, seats_left', guestFns.join(', '));
  const clientFns = await callable('authenticated');
  const expectedClientFns = [
    // migration 9 (admin daily pages) adds admin_class_rosters, admin_dashboard_summary,
    // admin_get_booking, admin_list_sessions and admin_search_bookings (all read-only)
    // migration 10 (admin setup pages) adds admin_create_promo, admin_earnings, admin_list_payments,
    // admin_list_users, admin_list_vouchers, admin_set_promo_enabled, admin_set_user_active,
    // admin_set_user_role, admin_update_session and admin_update_settings, plus the one-booking
    // admin_booking_change_info, admin_cancel_booking and admin_transfer_booking
    // migration 11 (payments) adds admin_billing_summary, confirm_free_booking,
    // save_online_checkout, start_online_payment and submit_manual_payment
    // (confirm_online_payment is for the server key only, so it's NOT here)
    // migration 20 (Users + Communications) adds admin_finish_message, admin_get_user,
    // admin_start_message, admin_update_user and admin_user_bookings
    'admin_billing_summary', 'admin_booking_change_info', 'admin_cancel_booking', 'admin_cancel_session', 'admin_class_rosters', 'admin_create_promo', 'admin_dashboard_summary',
    'admin_earnings', 'admin_finish_message', 'admin_get_booking', 'admin_get_user', 'admin_list_payments', 'admin_list_sessions', 'admin_list_users',
    'admin_list_vouchers', 'admin_review_manual_payment', 'admin_search_bookings', 'admin_set_attendance',
    'admin_set_promo_enabled', 'admin_set_user_active', 'admin_set_user_role', 'admin_start_message', 'admin_transfer_booking', 'admin_update_session',
    'admin_update_settings', 'admin_update_user', 'admin_user_bookings', 'admin_walkin_booking',
    // migration 16 (Change 17) adds close_my_account and my_account_deletion_blockers
    // (Delete account: each only touches the caller's own account)
    'book_seat', 'cancel_my_booking', 'check_voucher', 'close_my_account', 'confirm_free_booking', 'deactivate_my_account', 'generate_sessions',
    // migration 6 (booking pages): read only the caller's own bookings
    // migration 8 (My Account) adds get_my_bookings, get_my_payments, get_my_vouchers
    // migration 12 (client revisions) adds get_my_notifications, mark_my_notifications_read
    // and my_unread_notification_count (each only touches the caller's own rows)
    'get_my_booking', 'get_my_bookings', 'get_my_notifications', 'get_my_payments', 'get_my_session_booking', 'get_my_vouchers',
    'get_open_sessions', 'is_admin', 'mark_my_notifications_read', 'my_account_deletion_blockers', 'my_unread_notification_count',
    // migration 7 (pay page "Change details"): checks the owner inside
    // migration 17 (Version 1.4) adds reactivate_my_account (the caller's own account only)
    'reactivate_my_account', 'release_my_hold', 'save_online_checkout',
    'seats_left', 'start_online_payment', 'submit_manual_payment', 'transfer_my_booking',
  ];
  check('Functions a logged-in user can call (admin_* check is_admin inside)', `${expectedClientFns.length} public functions, no private helpers`,
    clientFns.join(', ') === expectedClientFns.join(', '), clientFns.join(', '));

  r = await t.attempt('A', `select public.seats_taken('${S1}')`);
  const r2 = await t.attempt('A', `select public.setting_text('admin_alert_email')`);
  check('Client calls private helpers (seats_taken, setting_text)', 'both refused', !r.ok && !r2.ok, `${r.err} | ${r2.err}`);

  // Every "security definer" function must pin its search_path (see migration 3).
  const unpinned = (await q(`
    select p.proname as name from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)).map((x) => x.name);
  check('Every security definer function sets search_path', 'none missing', unpinned.length === 0, unpinned.join(', ') || 'none missing');
}
