// Tests for migration 26 (..._v17_payments_filter.sql), Version 1.7 Prompt C.
//   - admin_list_payments() has the new p_provider filter, and the Earnings
//     page's 4 Method choices each find exactly the right payments:
//       All             every payment
//       PayMongo        provider paymongo (GCash, Maya and card online)
//       GCash transfer  provider manual + method gcash
//       BPI transfer    provider manual + method bpi
//     (Cash payments only show under All.)
//   - a made-up provider is refused; clients and guests still can't call it;
//     the old 7-value call still works
// Run with: npm run test:db   (see supabase/tests/README.md)

export const title = 'Version 1.7: Earnings method filter (PayMongo / GCash transfer / BPI transfer)';

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, one, attempt, sessionIn } = t;
  await t.addUser('A');
  await t.addUser('admin', { admin: true });

  // One confirmed booking per payment, all for client A, in a class 3 days away
  const cls = await sessionIn(72, 10);
  // Adds a booking with one paid payment.
  // Takes: the provider and method. Gives back: the payment id.
  async function paidWith(provider, method) {
    const booking = await t.confirmedBooking(cls, 'A');
    return (await one(`
      insert into public.payments (booking_id, provider, method, amount, status, paid_at)
      values ($1, $2, $3, 550, 'paid', now()) returning id`, [booking, provider, method])).id;
  }
  const ids = {
    paymongoGcash: await paidWith('paymongo', 'gcash'),
    paymongoMaya: await paidWith('paymongo', 'maya'),
    paymongoCard: await paidWith('paymongo', 'card'),
    manualGcash: await paidWith('manual', 'gcash'),
    manualBpi: await paidWith('manual', 'bpi'),
    cash: await paidWith('cash', 'cash'),
  };

  // The payment ids the admin's list gives back for one filter, sorted.
  async function listed(provider, method) {
    const r = await attempt('admin', `select payment_id from public.admin_list_payments(p_view => 'all', p_method => $1, p_provider => $2)`,
      [method, provider]);
    if (!r.ok) throw new Error(r.err);
    return r.rows.map((row) => row.payment_id).sort();
  }
  const same = (got, want) => JSON.stringify(got) === JSON.stringify([...want].sort());

  // ===========================================================================
  t.section('The 4 Method choices');
  // ===========================================================================
  let got = await listed(null, null);
  check('All', 'all 6 payments (cash too)', same(got, Object.values(ids)), `${got.length} rows`);
  got = await listed('paymongo', null);
  check('PayMongo', 'the 3 PayMongo payments (GCash, Maya, card), no transfers',
    same(got, [ids.paymongoGcash, ids.paymongoMaya, ids.paymongoCard]), `${got.length} rows`);
  got = await listed('manual', 'gcash');
  check('GCash transfer', 'only the manual GCash transfer (not PayMongo GCash)', same(got, [ids.manualGcash]), `${got.length} rows`);
  got = await listed('manual', 'bpi');
  check('BPI transfer', 'only the manual BPI transfer', same(got, [ids.manualBpi]), `${got.length} rows`);

  // ===========================================================================
  t.section('Safety');
  // ===========================================================================
  let r = await attempt('admin', `select * from public.admin_list_payments(p_provider => 'paypal')`);
  check('A made-up provider', 'refused', !r.ok && /Unknown payment provider/.test(r.err), r.err ?? 'ALLOWED');
  r = await attempt('A', `select * from public.admin_list_payments(p_provider => 'paymongo')`);
  check('A client calls it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('guest', `select * from public.admin_list_payments()`);
  check('A guest calls it', 'refused', !r.ok, r.err ?? 'ALLOWED');
  r = await attempt('admin', `select * from public.admin_list_payments('all', 'paid', 'bpi', null, null, null, 200)`);
  check('The old 7-value call', 'still works', r.ok && r.rows.length === 1 && r.rows[0].payment_id === ids.manualBpi, r.err ?? `${r.rows?.length} rows`);
  const versions = await one(`select count(*)::int as n from pg_proc where proname = 'admin_list_payments'`);
  check('Only one admin_list_payments', '1 function (the old version was dropped)', versions.n === 1, versions.n);
}
