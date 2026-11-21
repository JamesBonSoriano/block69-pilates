// Tests for migration 20261121000006_v19_admin_sorting.sql (Version 1.9).
//   - Earnings: admin_list_payments(p_sort) gives newest first by default,
//     oldest first with 'oldest', the same rows either way, and pages that
//     follow the chosen order; a made-up sort word is refused
//   - Schedule: admin_upcoming_classes(p_page, p_sort) gives soonest first by
//     default, latest first with 'desc'; a made-up sort word is refused
//   - clients still can't use either one
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.9: Earnings and Schedule sorting';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, attempt, sessionIn } = t;
  await t.addUser('A');
  await t.addUser('admin', { admin: true });

  // ---- Earnings: three paid payments, one day apart (oldest = 3 days ago)
  const cls = await sessionIn(72, 10);
  const paymentIds = [];
  for (const daysAgo of [3, 2, 1]) {
    const booking = await t.confirmedBooking(cls, 'A');
    paymentIds.push((await one(`
      insert into public.payments (booking_id, provider, method, amount, status, paid_at)
      values ($1, 'cash', 'cash', 550, 'paid', now() - make_interval(days => $2)) returning id`, [booking, daysAgo])).id);
  }
  const [oldest, middle, newest] = paymentIds;
  // Only these three payments are compared (other test data may exist)
  const listSql = `select payment_id from public.admin_list_payments(p_view => 'all', p_limit => $1, p_offset => $2, p_sort => $3)
                   where payment_id = any($4::uuid[])`;

  let r = await attempt('admin', `select payment_id from public.admin_list_payments(p_view => 'all', p_limit => 500)
                                  where payment_id = any($1::uuid[])`, [paymentIds]);
  check('Earnings default order is newest first', 'newest, middle, oldest',
    r.ok && r.rows.map((x) => x.payment_id).join() === [newest, middle, oldest].join(), r.err ?? r.rows?.length);

  r = await attempt('admin', listSql, [500, 0, 'oldest', paymentIds]);
  check('Earnings "oldest" order is oldest first', 'oldest, middle, newest',
    r.ok && r.rows.map((x) => x.payment_id).join() === [oldest, middle, newest].join(), r.err ?? r.rows?.length);

  // Paging follows the order: with every payment in the database, page 1 of
  // size 1 sorted oldest must be the oldest payment of ALL payments
  const firstOldest = await one(`select id from public.payments order by coalesce(paid_at, created_at), id limit 1`);
  r = await attempt('admin', `select payment_id from public.admin_list_payments(p_view => 'all', p_limit => 1, p_offset => 0, p_sort => 'oldest')`);
  check('Earnings pages follow the "oldest" order', 'page 1 = the oldest payment',
    r.ok && r.rows.length === 1 && r.rows[0].payment_id === firstOldest.id, r.err);

  r = await attempt('admin', `select * from public.admin_list_payments(p_sort => 'sideways')`);
  check('Earnings refuses an unknown sort word', 'refused', !r.ok, r.err);

  r = await attempt('A', `select * from public.admin_list_payments(p_sort => 'oldest')`);
  check('A client cannot list payments (any sort)', 'refused', !r.ok, r.err);

  // ---- Schedule: page 1 soonest first vs latest first
  const total = (await one(`select count(*)::int as n from public.class_sessions s
                            where s.date >= public.manila_today() and public.at_manila(s.date, s.end_time) > now()`)).n;
  r = await attempt('admin', `select session_id, date, start_time, total_count from public.admin_upcoming_classes(1)`);
  const soonest = await one(`select id from public.class_sessions s
                             where s.date >= public.manila_today() and public.at_manila(s.date, s.end_time) > now()
                             order by s.date, s.start_time limit 1`);
  check('Schedule default order is soonest first', 'page 1 starts with the next class',
    r.ok && r.rows[0]?.session_id === soonest.id && r.rows[0]?.total_count === total, r.err);

  r = await attempt('admin', `select session_id, date, start_time from public.admin_upcoming_classes(1, 'desc')`);
  const latest = await one(`select id from public.class_sessions s
                            where s.date >= public.manila_today() and public.at_manila(s.date, s.end_time) > now()
                            order by s.date desc, s.start_time desc limit 1`);
  const descending = r.ok && r.rows.every((row, n) => n === 0
    || `${r.rows[n - 1].date.toISOString?.() ?? r.rows[n - 1].date} ${r.rows[n - 1].start_time}` >= `${row.date.toISOString?.() ?? row.date} ${row.start_time}`);
  check('Schedule "desc" order is latest first', 'page 1 starts with the last class, dates going down',
    r.ok && r.rows[0]?.session_id === latest.id && descending, r.err);

  r = await attempt('admin', `select * from public.admin_upcoming_classes(1, 'sideways')`);
  check('Schedule refuses an unknown sort word', 'refused', !r.ok, r.err);

  r = await attempt('A', `select * from public.admin_upcoming_classes(1, 'desc')`);
  check('A client cannot list the schedule (any sort)', 'refused', !r.ok, r.err);
}
