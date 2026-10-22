// Tests for supabase/seed.sql (sample data for testing only): it loads on top
// of the migrations without errors, covers all 10 booking statuses, its
// vouchers behave correctly, and it is safe to run twice.
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Sample data (seed.sql)';

const seedFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed.sql');

// The fixed ids seed.sql gives its sample clients.
const BEA = '00000000-0000-4000-8000-00000000b0a1';
const CARLO = '00000000-0000-4000-8000-00000000ca71';

const ALL_STATUSES = [
  'pending_payment', 'awaiting_verification', 'confirmed', 'paid_needs_action', 'expired',
  'transferred', 'cancelled_with_voucher', 'forfeited', 'no_show', 'attended',
];

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one } = t;

  // ===========================================================================
  t.section('Loading seed.sql');
  // ===========================================================================
  let loaded;
  try {
    await t.db.query(fs.readFileSync(seedFile, 'utf8'));
    loaded = { ok: true };
  } catch (e) {
    loaded = { ok: false, err: e.message };
  }
  check('seed.sql loads after the migrations', 'no errors', loaded.ok, loaded.ok ? 'no errors' : loaded.err);
  if (!loaded.ok) return; // nothing else can be checked

  const counts = () => one(`select
    (select count(*) from public.profiles)::int as clients,
    (select count(*) from public.bookings)::int as bookings,
    (select count(*) from public.payments)::int as payments,
    (select count(*) from public.vouchers)::int as vouchers`);
  const first = await counts();
  // 12 payments, not 13: the booking made by a transfer has no payment of its own.
  check('Adds 3 clients, 13 bookings, 12 payments, 3 vouchers', '3 / 13 / 12 / 3',
    first.clients === 3 && first.bookings === 13 && first.payments === 12 && first.vouchers === 3,
    `${first.clients} / ${first.bookings} / ${first.payments} / ${first.vouchers}`);

  const statuses = (await q('select distinct status::text as s from public.bookings')).map((x) => x.s);
  const missing = ALL_STATUSES.filter((s) => !statuses.includes(s));
  check('All 10 booking statuses appear', 'all 10', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'all 10');

  const names = (await q('select full_name from public.profiles order by 1')).map((x) => x.full_name);
  check('Sign-up trigger filled in the sample names', 'Bea, Carlo, Dana (sample)',
    names.length === 3 && names.every((n) => n.endsWith('(sample)')), names.join(', '));

  // ===========================================================================
  t.section('Sample data follows the rules');
  // ===========================================================================
  // The upcoming class with Bea, Carlo (screenshot), Dana (live hold) and a walk-in.
  const busy = (await one(`select session_id from public.bookings where walkin_name = 'Fe Walk-in (sample)'`)).session_id;
  const left = await t.seatsLeft(busy);
  check('The busy upcoming class is full (confirmed + screenshot + live hold + walk-in)', '0 seats left', left === 0, `${left} seats left`);

  const welcome = await one("select uses_left from public.vouchers where code = 'WELCOME10'");
  check("Bea's paid booking spent one WELCOME10 use (trigger)", 'uses_left 99', welcome.uses_left === 99, `uses_left ${welcome.uses_left}`);

  const transfer = await one(`
    select n.status as new_status, o.status as old_status,
           (select count(*) from public.payments p where p.booking_id = n.id)::int as payments_on_new
    from public.bookings n join public.bookings o on o.id = n.transferred_from`);
  check('Transfer: old = transferred, new = confirmed, payment stays on the old one',
    'transferred -> confirmed, 0 payments on the new one',
    transfer?.old_status === 'transferred' && transfer?.new_status === 'confirmed' && transfer?.payments_on_new === 0,
    transfer ? `${transfer.old_status} -> ${transfer.new_status}, ${transfer.payments_on_new} payments on the new one` : 'no transfer found');

  // ===========================================================================
  t.section('Sample vouchers');
  // ===========================================================================
  // A brand-new client tries WELCOME10 (10% of the 500 class fee = 50).
  await t.addUser('newbie');
  let r = await t.attempt('newbie', "select discount from public.check_voucher('welcome10')");
  check('New client applies WELCOME10', 'discount 50.00', r.ok && r.row.discount === '50.00', r.ok ? `discount ${r.row.discount}` : r.err);

  // Log in as the sample clients (the test can do this without a password).
  t.users.Bea = BEA;
  t.users.Carlo = CARLO;
  r = await t.attempt('Carlo', "select discount from public.check_voucher('HALF-OLD001')");
  check("Carlo uses his EXPIRED 50% code", 'refused: expired', !r.ok && r.err.includes('expired'), r.err);
  r = await t.attempt('Bea', "select discount from public.check_voucher('HALF-BEA001')");
  check("Bea uses her valid 50% code", 'discount 250.00', r.ok && r.row.discount === '250.00', r.ok ? `discount ${r.row.discount}` : r.err);
  r = await t.attempt('Bea', 'select code from public.vouchers order by code');
  check('My Vouchers: Bea sees only her own code', 'HALF-BEA001', r.ok && r.rows.map((x) => x.code).join() === 'HALF-BEA001',
    r.ok ? r.rows.map((x) => x.code).join(', ') : r.err);
  r = await t.attempt('Carlo', 'select count(*)::int as n from public.bookings');
  check('My Bookings: Carlo sees only his own 3 bookings', '3', r.ok && r.row.n === 3, r.ok ? r.row.n : r.err);

  // ===========================================================================
  t.section('Safe to run twice');
  // ===========================================================================
  // (The new client above added 1 profile, so compare against the counts right now.)
  const before = await counts();
  let again;
  try {
    await t.db.query(fs.readFileSync(seedFile, 'utf8'));
    again = { ok: true };
  } catch (e) {
    again = { ok: false, err: e.message };
  }
  const after = await counts();
  check('Run seed.sql again: no errors, nothing added twice', 'same counts',
    again.ok && JSON.stringify(before) === JSON.stringify(after), again.ok ? JSON.stringify(after) : again.err);
}
