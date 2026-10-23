// Tests for Change 17's page-text migrations (docs/prompts/17-client-revisions-2.md):
//   migration 13 (..._r2_home_content.sql): the new Home hero, Class Details &
//   Location, the mat line, and Health and Safety moving to Home.
// Each content migration must only change text the admin never edited, and be
// safe to run twice.
// Run with: npm run test:db   (see supabase/tests/README.md)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const title = 'Change 17: page text (Home)';

// A migration file by the end of its name, so it can be run a second time.
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migrationFile = (suffix) => path.join(migrationsDir, fs.readdirSync(migrationsDir).find((f) => f.endsWith(suffix)));
const HOME_FILE = migrationFile('_r2_home_content.sql');

// Runs every check in this file.
// Takes: the toolbox from helpers.mjs. Gives back: nothing (results go to t.check).
export default async function run(t) {
  const { check, q, one } = t;

  // Reads one block. Takes: page and section. Gives back: the row or undefined.
  const block = (page, section) =>
    one('select title, body, image_path from public.site_content where page = $1 and section = $2', [page, section]);

  // Runs a migration file again. Gives back: { ok } or { ok: false, err }.
  async function rerun(file) {
    try {
      await t.db.query(fs.readFileSync(file, 'utf8'));
      return { ok: true };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  }

  // ===========================================================================
  t.section('Home: the new text is there');
  // ===========================================================================
  const hero = await block('home', 'hero');
  check('Hero headline', 'Mat Pilates For Beginners', hero?.title === 'Mat Pilates For Beginners', hero?.title);
  check('Hero description is the proposal\'s text', 'starts "Start your day by slowing down"',
    hero?.body?.startsWith('Start your day by slowing down') && hero.body.includes('STOTT method'), hero?.body?.slice(0, 40));

  const details = await block('home', 'class_details');
  check('Class Details & Location block (text copied from "About the class")', 'Class Details & Location, STOTT text',
    details?.title === 'Class Details & Location' && details.body.includes('STOTT'), details && `${details.title}`);

  const matNote = await block('home', 'mat_note');
  check('Mat rental line', "Don't have a mat? Add mat rental to your booking.",
    matNote?.body === "Don't have a mat? Add mat rental to your booking.", matNote?.body);

  const health = await block('home', 'health_safety');
  check('Health and Safety Information (copied from About Us)', '3 lines, mentions pregnant',
    health?.title === 'Health and Safety Information' && health.body.split('\n').length === 3 && /pregnant/i.test(health.body),
    health && `${health.title}, ${health.body.split('\n').length} lines`);

  const oldBlocks = await one(
    `select count(*)::int as n from public.site_content
      where page = 'home' and section in ('about_class', 'feature_1', 'feature_2', 'feature_3', 'location_drink', 'health_note')`);
  check('Old Home blocks are kept in the database (only hidden)', '6 rows', oldBlocks.n === 6, `${oldBlocks.n} rows`);

  // ===========================================================================
  t.section('Home: admin edits are never overwritten');
  // ===========================================================================
  // The admin edits the hero and the new section, then the migration runs again
  await q(`update public.site_content set title = 'Our own headline', body = 'Our own words' where page = 'home' and section = 'hero'`);
  await q(`update public.site_content set body = 'Edited details' where page = 'home' and section = 'class_details'`);
  const count = () => one('select count(*)::int as n from public.site_content');
  const before = await count();
  const again = await rerun(HOME_FILE);
  const after = await count();
  check('Run it again: no errors, no duplicates', `${before.n} blocks`, again.ok && before.n === after.n,
    again.ok ? `${after.n} blocks` : again.err);
  const heroKept = await block('home', 'hero');
  check('Edited hero is kept', 'Our own headline / Our own words',
    heroKept.title === 'Our own headline' && heroKept.body === 'Our own words', `${heroKept.title} / ${heroKept.body}`);
  const detailsKept = await block('home', 'class_details');
  check('Edited Class Details is kept', 'Edited details', detailsKept.body === 'Edited details', detailsKept.body);

  // A cafe that had already edited "About the class", Health and Safety and
  // uploaded a location photo BEFORE this migration: their versions carry over
  await q(`delete from public.site_content where page = 'home' and section in ('class_details', 'health_safety')`);
  await q(`update public.site_content set body = 'Our class, our words' where page = 'home' and section = 'about_class'`);
  await q(`update public.site_content set image_path = '/images/cafe.jpg' where page = 'home' and section = 'location_drink'`);
  await q(`update public.site_content set body = E'Line one\nLine two' where page = 'about' and section = 'health_safety'`);
  await rerun(HOME_FILE);
  const carried = await block('home', 'class_details');
  check('Edited "About the class" text and the location photo carry over', 'Our class, our words + /images/cafe.jpg',
    carried?.body === 'Our class, our words' && carried.image_path === '/images/cafe.jpg',
    carried && `${carried.body} + ${carried.image_path}`);
  const carriedHealth = await block('home', 'health_safety');
  check('Edited Health and Safety list carries over to Home', 'Line one / Line two',
    carriedHealth?.body === 'Line one\nLine two', carriedHealth?.body?.replace('\n', ' / '));
}
