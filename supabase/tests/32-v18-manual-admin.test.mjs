// Covers expiry, competing approval, receipt evidence, and admin queries.
export const title = 'Version 1.8: manual review and admin lists';

export default async function run(t) {
  const { as, attempt, check, one } = t;
  const user = await t.addUser('A');
  await t.addUser('admin', { admin: true });
  const ended = await t.sessionIn(-48);
  const future = await t.sessionIn(48);
  const approve = 'select public.admin_review_manual_payment($1, true) as status';
  const expire = 'select public.expire_ended_manual_transfers() as count';

  // Seeds both referenced and legacy pending transfers with stored evidence.
  async function pending(session, method, reference) {
    const booking = await one("insert into public.bookings (session_id, user_id, status, class_fee, total, agreed_at) values ($1, $2, 'awaiting_verification', 500, 500, now()) returning id", [session, user]);
    const payment = await one("insert into public.payments (booking_id, provider, method, amount, status, screenshot_path, transaction_reference) values ($1, 'manual', $2, 500, 'pending', $3, $4) returning id", [booking.id, method, user + '/proof.png', reference]);
    return { booking: booking.id, payment: payment.id };
  }

  const late = await pending(ended, 'gcash', 'TRANSFER-123');
  const before = await attempt('admin', approve, [late.payment]);
  check('Late approval fails before cron runs', 'class ended', !before.ok && /class has ended/i.test(before.err), before.err);
  const shown = await attempt('admin', "select status from public.admin_search_bookings(p_when => 'all') where booking_id = $1", [late.booking]);
  check('Ended manual appointment is immediately listed as cancelled', 'expired', shown.row?.status === 'expired', shown.row?.status);

  // Keep expiry uncommitted on one connection while the reviewer starts on another.
  const job = await t.connect();
  const reviewer = await t.connect();
  try {
    await job.query('begin');
    await t.setActor(job, 'server');
    await job.query(expire);
    await reviewer.query('begin');
    await t.setActor(reviewer, 'admin');
    const blocked = reviewer.query(approve, [late.payment]).then(() => true, () => false);
    // Verify the approval transaction is actually waiting for the expiry lock.
    const pid = (await job.query('select pg_backend_pid() as id')).rows[0].id;
    let waiting = false;
    for (let i = 0; i < 100 && !waiting; i++) {
      waiting = (await one("select exists (select 1 from pg_stat_activity a where $1 = any(pg_blocking_pids(a.pid))) as waiting", [pid])).waiting;
      if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await job.query('commit');
    check('Approval racing a committed expiry cannot confirm', 'waited, then refused', waiting && !(await blocked));
    await reviewer.query('rollback');
  } finally {
    await Promise.all([job.end(), reviewer.end()]);
  }

  const proof = await one('select status, screenshot_path, transaction_reference, paid_at from public.payments where id = $1', [late.payment]);
  check('Expiry preserves proof and does not mark money received', 'expired, evidence intact', proof.status === 'expired' && proof.screenshot_path === user + '/proof.png' && proof.transaction_reference === 'TRANSFER-123' && proof.paid_at === null, JSON.stringify(proof));
  check('Expiry is safe to repeat', 'zero changes', (await as('server', expire)).row?.count === 0);

  const legacy = await pending(future, 'bpi', null);
  const confirmed = await as('admin', approve, [legacy.payment]);
  check('Older pending BPI transfer remains reviewable', 'confirmed', confirmed.row?.status === 'confirmed', confirmed.err);
  check('Repeated approval cannot send a second confirmation', 'refused', !(await attempt('admin', approve, [legacy.payment])).ok);
  const newest = await attempt('admin', "select booking_id from public.admin_search_bookings(p_when => 'all', p_sort => 'newest', p_limit => 1)");
  const oldest = await attempt('admin', "select booking_id from public.admin_search_bookings(p_when => 'all', p_sort => 'oldest', p_limit => 1)");
  check('Appointment sort uses booked timestamps before pagination', 'new and old booking IDs', newest.row?.booking_id === legacy.booking && oldest.row?.booking_id === late.booking);
  const first = await attempt('admin', 'select payment_id, total_matches from public.admin_list_payments(p_limit => 1)');
  const second = await attempt('admin', 'select payment_id, total_matches from public.admin_list_payments(p_limit => 1, p_offset => 1)');
  check('Payment pages are disjoint and keep the filtered total', 'two rows across pages', first.row?.total_matches === 2 && second.row?.total_matches === 2 && first.row.payment_id !== second.row.payment_id);
  const cancellation = await as('admin', 'select public.admin_cancel_class_for_email($1) as result', [future]);
  const recipients = cancellation.row?.result?.recipients;
  check('Cancellation returns each affected client once', 'one recipient', recipients?.length === 1 && recipients[0].user_id === user, JSON.stringify(recipients));
  check('Repeated cancellation cannot trigger more emails', 'refused', !(await attempt('admin', 'select public.admin_cancel_class_for_email($1)', [future])).ok);
}
