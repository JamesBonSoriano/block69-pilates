// Tests for migration 4 (the default data the real website needs): the
// settings and which of them are public, the weekly templates, the first 4
// weeks of classes, the starter page text, and that the file is safe to run twice.
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Default data (migration 4)';

// Settings the website reads. Anyone (even guests) may read these.
const PUBLIC_KEYS = [
  'class_price', 'mat_price', 'cutoff_time', 'hold_minutes', 'drink_options', 'manual_payment_enabled',
  'cafe_name', 'cafe_address', 'cafe_email', 'cafe_phone', 'maps_url', 'logo_path',
  'instagram_url', 'facebook_url', 'chat_url',
  'gcash_name', 'gcash_number', 'bpi_account_name', 'bpi_account_number',
];
// Settings only admins need.
const PRIVATE_KEYS = ['admin_alert_email', 'sessions_weeks_ahead'];

// Page blocks the website expects to find, as 'page/section'.
const CONTENT_BLOCKS = [
  'home/hero', 'home/about_class', 'home/location_drink', 'home/feature_1', 'home/feature_2', 'home/feature_3',
  'home/health_note', 'about/cafe', 'about/instructor', 'about/visit', 'about/contact', 'about/health_safety',
  'booking/what_to_bring', 'booking/cancellation_policy', 'booking/agreement', 'footer/strays_note',
];

// The migration file itself, so we can run it a second time.
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const defaultDataFile = path.join(migrationsDir, fs.readdirSync(migrationsDir).find((f) => f.endsWith('_default_data.sql')));

// Compares two lists, ignoring order. Gives back true if they hold the same items.
const sameItems = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one } = t;
  await t.addUser('A');
  await t.addUser('admin', { admin: true });

  // ===========================================================================
  t.section('Settings');
  // ===========================================================================
  const rows = await q('select key, value, is_public from public.settings');
  const s = Object.fromEntries(rows.map((r) => [r.key, r]));

  const badPublic = PUBLIC_KEYS.filter((k) => !s[k] || s[k].is_public !== true);
  check('All website settings exist and are public', `${PUBLIC_KEYS.length} public settings`,
    badPublic.length === 0, badPublic.length ? `missing or private: ${badPublic.join(', ')}` : `${PUBLIC_KEYS.length} public settings`);

  const badPrivate = PRIVATE_KEYS.filter((k) => !s[k] || s[k].is_public !== false);
  check('Admin-only settings exist and are private', PRIVATE_KEYS.join(', '),
    badPrivate.length === 0, badPrivate.length ? `missing or public: ${badPrivate.join(', ')}` : PRIVATE_KEYS.join(', '));

  // A new setting must be put in one of the two lists above on purpose.
  const unknown = rows.map((r) => r.key).filter((k) => !PUBLIC_KEYS.includes(k) && !PRIVATE_KEYS.includes(k));
  check('No setting left unsorted (public vs private)', 'none', unknown.length === 0, unknown.join(', ') || 'none');

  const v = (k) => s[k]?.value;
  check('Prices', 'class 500, mat 50', v('class_price') === 500 && v('mat_price') === 50,
    `class ${v('class_price')}, mat ${v('mat_price')}`);
  check('Booking rules', 'cutoff 08:00, hold 15 min, manual payment on',
    v('cutoff_time') === '08:00' && v('hold_minutes') === 15 && v('manual_payment_enabled') === true,
    `cutoff ${v('cutoff_time')}, hold ${v('hold_minutes')} min, manual ${v('manual_payment_enabled')}`);
  const drinks = ['Iced Matcha', 'Hot Matcha', 'Iced Spanish Latte', 'Hot Spanish Latte', 'Americano', 'Decide at the cafe'];
  check('Drink options', drinks.join(', '), JSON.stringify(v('drink_options')) === JSON.stringify(drinks),
    (v('drink_options') ?? []).join(', '));
  check('Cafe details', 'Block 69 Cafe, 444 Kamagong St..., block69cafe@gmail.com',
    v('cafe_name') === 'Block 69 Cafe' && v('cafe_address').startsWith('444 Kamagong St.') && v('cafe_email') === 'block69cafe@gmail.com',
    `${v('cafe_name')}, ${v('cafe_address')}, ${v('cafe_email')}`);
  const placeholders = ['gcash_name', 'gcash_number', 'bpi_account_name', 'bpi_account_number'];
  check('GCash / BPI details are clear [PLACEHOLDERS]', 'all 4 in [brackets]',
    placeholders.every((k) => /^\[.+\]$/.test(v(k))), placeholders.map((k) => v(k)).join(', '));

  // What each kind of visitor can read (RLS from migration 2 + is_public).
  const readAs = async (actor) => {
    const r = await t.attempt(actor, 'select key from public.settings');
    return r.ok ? r.rows.map((x) => x.key) : [];
  };
  const guestKeys = await readAs('guest');
  check('Guest reads exactly the public settings', `${PUBLIC_KEYS.length} settings, no private ones`,
    sameItems(guestKeys, PUBLIC_KEYS), `${guestKeys.length} settings${guestKeys.some((k) => PRIVATE_KEYS.includes(k)) ? ' INCLUDING PRIVATE' : ''}`);
  const clientKeys = await readAs('A');
  check('Client reads exactly the public settings', `${PUBLIC_KEYS.length} settings`,
    sameItems(clientKeys, PUBLIC_KEYS), `${clientKeys.length} settings`);
  const adminKeys = await readAs('admin');
  check('Admin reads all settings', `${rows.length} settings`, adminKeys.length === rows.length, `${adminKeys.length} settings`);

  // ===========================================================================
  t.section('Weekly templates');
  // ===========================================================================
  const templates = (await q(`
    select weekday || ' ' || to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI') || ' cap ' || default_capacity as slot
    from public.schedule_templates where is_active`)).map((r) => r.slot);
  const expectedSlots = [4, 5, 6, 0].flatMap((d) => [`${d} 09:00-09:50 cap 4`, `${d} 10:15-11:05 cap 4`]);
  check('Thu-Sun, 9:00-9:50 and 10:15-11:05, 4 seats', '8 templates (weekdays 4, 5, 6, 0)',
    sameItems(templates, expectedSlots), `${templates.length} templates: ${templates.join('; ')}`);

  // ===========================================================================
  t.section('Classes (generate_sessions(4))');
  // ===========================================================================
  const sess = await one(`
    select count(*)::int as n,
           count(*) filter (where extract(dow from date) not in (4, 5, 6, 0))::int as wrong_day,
           count(*) filter (where capacity <> 4 or status <> 'open' or template_id is null)::int as odd,
           (min(date) - public.manila_today())::int as first_day,
           (max(date) - public.manila_today())::int as last_day
    from public.class_sessions`);
  check('4 weeks of classes created', '32 (16 days x 2 sessions)', sess.n === 32, sess.n);
  check('All on Thursday to Sunday', '0 on other days', sess.wrong_day === 0, `${sess.wrong_day} on other days`);
  check('All open, 4 seats, linked to a template', '0 odd ones', sess.odd === 0, `${sess.odd} odd ones`);
  check('From today up to 4 weeks ahead', 'days 0..27 from today', sess.first_day >= 0 && sess.last_day <= 27,
    `days ${sess.first_day}..${sess.last_day} from today`);
  const listed = await t.attempt('guest', 'select count(*)::int as n from public.get_open_sessions()');
  check('Guest sees them with get_open_sessions()', '32 classes', listed.ok && listed.row.n === 32, listed.ok ? `${listed.row.n} classes` : listed.err);

  // ===========================================================================
  t.section('Page content');
  // ===========================================================================
  const content = await q('select page, section, title, body from public.site_content');
  const blocks = Object.fromEntries(content.map((r) => [`${r.page}/${r.section}`, r]));
  const missing = CONTENT_BLOCKS.filter((k) => !blocks[k]?.body?.trim());
  check('Every expected page block has text', `${CONTENT_BLOCKS.length} blocks`, missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${CONTENT_BLOCKS.length} blocks`);

  const bring = (blocks['booking/what_to_bring']?.body ?? '').split('\n');
  // (Migration 12 changed the list to the revisions' wording. The mat stays
  // FIRST: booking step 1 puts the "Rent a mat" tick under it.)
  check('What to bring: one item per line', 'workout mat, water bottle, towel, workout clothes',
    bring.length === 4 && /mat/i.test(bring[0]) && /water/i.test(bring[1]) && /towel/i.test(bring[2]) && /clothes/i.test(bring[3]),
    bring.join(' | '));

  const policy = blocks['booking/cancellation_policy']?.body ?? '';
  check('Policy text matches the rules', 'mentions 24h, 12h, 50%, 60 days',
    ['24 hours', '12 to 24 hours', 'Less than 12 hours', '50%', '60 days'].every((w) => policy.includes(w)),
    `${policy.split('\n').length} lines`);

  const agreement = blocks['booking/agreement']?.body ?? '';
  check('Agreement covers pregnancy, injuries and the policy', 'all three mentioned',
    /pregnant/i.test(agreement) && /injur/i.test(agreement) && /cancellation policy/i.test(agreement), `${agreement.split('\n').length} lines`);

  // Prices must come from settings, so page text never has a peso amount in it.
  // (Only peso signs/words are checked: "50-minute" and "50%" are fine.)
  const withPrice = content.filter((r) => /₱|\bPHP\b|\bpesos?\b/i.test(`${r.title ?? ''} ${r.body ?? ''}`));
  check('No prices written in page text', 'none', withPrice.length === 0,
    withPrice.map((r) => `${r.page}/${r.section}`).join(', ') || 'none');

  const guestContent = await t.attempt('guest', 'select count(*)::int as n from public.site_content');
  check('Guest can read the page content', `${content.length} blocks`, guestContent.ok && guestContent.row.n === content.length,
    guestContent.ok ? `${guestContent.row.n} blocks` : guestContent.err);

  // ===========================================================================
  t.section('Safe to run twice');
  // ===========================================================================
  // Pretend the admin already changed the price and edited the hero text...
  await q(`update public.settings set value = '600' where key = 'class_price'`);
  await q(`update public.site_content set title = 'Edited by admin' where page = 'home' and section = 'hero'`);
  const countAll = () => one(`select
    (select count(*) from public.settings)::int as settings,
    (select count(*) from public.schedule_templates)::int as templates,
    (select count(*) from public.class_sessions)::int as sessions,
    (select count(*) from public.site_content)::int as content`);
  const before = await countAll();

  // ...then run the whole migration file again.
  let rerun;
  try {
    await t.db.query(fs.readFileSync(defaultDataFile, 'utf8'));
    rerun = { ok: true };
  } catch (e) {
    rerun = { ok: false, err: e.message };
  }
  const after = await countAll();
  const fmt = (c) => `${c.settings} settings, ${c.templates} templates, ${c.sessions} classes, ${c.content} blocks`;
  check('Run migration 4 again: no errors, no duplicates', fmt(before),
    rerun.ok && JSON.stringify(before) === JSON.stringify(after), rerun.ok ? fmt(after) : rerun.err);

  const kept = await one(`select
    (select value from public.settings where key = 'class_price') as price,
    (select title from public.site_content where page = 'home' and section = 'hero') as hero`);
  check("Admin's changes are kept (not overwritten)", 'price 600, hero "Edited by admin"',
    kept.price === 600 && kept.hero === 'Edited by admin', `price ${kept.price}, hero "${kept.hero}"`);
}
