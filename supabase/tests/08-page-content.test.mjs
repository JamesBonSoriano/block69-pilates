// Tests for migration 5 (extra page text for Home, About Us and Policies):
// every block the pages expect is there, the "fill-in" words like
// {mat_price} are ones the website knows, and the file is safe to run twice.
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Page text for Home, About Us and Policies (migration 5)';

// Page blocks migration 5 adds, as 'page/section'.
const NEW_BLOCKS = [
  'home/hero_kicker', 'home/included', 'home/how_it_works', 'home/step_1', 'home/step_2', 'home/step_3', 'home/cta',
  'about/instructor_name', 'about/class', 'about/schedule', 'about/policy_summary',
  'about/faq_1', 'about/faq_2', 'about/faq_3', 'about/faq_4', 'about/faq_5', 'about/faq_6', 'about/faq_7',
  'policies/intro',
];

// The fill-in words the website swaps for settings values.
// Keep this the same as FILL_INS in src/lib/content-text.ts.
// (facebook_link and instagram_link: Change 17, the Registration Agreement)
const KNOWN_FILL_INS = ['class_price', 'mat_price', 'cutoff_time', 'hold_minutes', 'cafe_name', 'facebook_link', 'instagram_link'];

// The migration file itself, so we can run it a second time.
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const pageContentFile = path.join(migrationsDir, fs.readdirSync(migrationsDir).find((f) => f.endsWith('_page_content.sql')));

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one } = t;

  // ===========================================================================
  t.section('New page blocks');
  // ===========================================================================
  const content = await q('select page, section, title, body from public.site_content');
  const blocks = Object.fromEntries(content.map((r) => [`${r.page}/${r.section}`, r]));

  // Every new block exists and has a heading (the kicker and FAQ use the title too)
  const missing = NEW_BLOCKS.filter((k) => !blocks[k]?.title?.trim());
  check('Every new block is there with a title', `${NEW_BLOCKS.length} blocks`, missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${NEW_BLOCKS.length} blocks`);

  // Every FAQ question has an answer
  const faqs = content.filter((r) => r.page === 'about' && /^faq_\d+$/.test(r.section));
  const noAnswer = faqs.filter((r) => !r.body?.trim());
  check('Every FAQ has a question and an answer', '7 questions', faqs.length === 7 && noAnswer.length === 0,
    `${faqs.length} questions, ${noAnswer.length} without an answer`);

  // "What's included" mentions the mat price only through the fill-in word
  const included = blocks['home/included']?.body ?? '';
  check('"What\'s included" is a list and uses {mat_price}', '4 lines, has {mat_price}',
    included.split('\n').length === 4 && included.includes('{mat_price}'), `${included.split('\n').length} lines`);

  // The short policy on About Us matches the rules the database enforces
  const summary = blocks['about/policy_summary']?.body ?? '';
  check('Short policy matches the rules', 'mentions 24 hours, 12 to 24 hours, 50%, 60 days, 12 hours',
    ['24 hours', '12 to 24 hours', '50%', '60 days', 'Less than 12 hours'].every((w) => summary.includes(w)),
    `${summary.split('\n').length} lines`);

  // ===========================================================================
  t.section('Fill-in words');
  // ===========================================================================
  // Find every {word} in ALL page text (old and new). An unknown one would
  // show up on the page as "{word}", so it must be one the website knows.
  const used = new Set();
  for (const r of content) {
    for (const m of `${r.title ?? ''} ${r.body ?? ''}`.matchAll(/\{([a-z_]+)\}/g)) used.add(m[1]);
  }
  const unknown = [...used].filter((w) => !KNOWN_FILL_INS.includes(w));
  check('Every {fill-in} word is one the website knows', 'none unknown', unknown.length === 0,
    unknown.length ? `unknown: ${unknown.join(', ')}` : `used: ${[...used].sort().join(', ')}`);

  // Prices must come from settings (same rule as migration 4)
  const withPrice = content.filter((r) => /₱|\bPHP\b|\bpesos?\b/i.test(`${r.title ?? ''} ${r.body ?? ''}`));
  check('Still no prices written in page text', 'none', withPrice.length === 0,
    withPrice.map((r) => `${r.page}/${r.section}`).join(', ') || 'none');

  // Guests can read the new blocks (Home, About Us and Policies are public pages)
  const guest = await t.attempt('guest', `select count(*)::int as n from public.site_content where page = 'policies'`);
  check('Guest can read the Policies intro', '1 block', guest.ok && guest.row.n === 1,
    guest.ok ? `${guest.row.n} block(s)` : guest.err);

  // ===========================================================================
  t.section('Safe to run twice');
  // ===========================================================================
  // Pretend the admin already filled in the instructor's name...
  await q(`update public.site_content set title = 'Coach Ana' where page = 'about' and section = 'instructor_name'`);
  const countBlocks = () => one('select count(*)::int as n from public.site_content');
  const before = await countBlocks();

  // ...then run the whole migration file again.
  let rerun;
  try {
    await t.db.query(fs.readFileSync(pageContentFile, 'utf8'));
    rerun = { ok: true };
  } catch (e) {
    rerun = { ok: false, err: e.message };
  }
  const after = await countBlocks();
  check('Run migration 5 again: no errors, no duplicates', `${before.n} blocks`,
    rerun.ok && before.n === after.n, rerun.ok ? `${after.n} blocks` : rerun.err);

  const kept = await one(`select title from public.site_content where page = 'about' and section = 'instructor_name'`);
  check("Admin's edit is kept (not overwritten)", 'Coach Ana', kept.title === 'Coach Ana', kept.title);
}
