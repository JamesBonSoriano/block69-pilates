// Runs all the database tests. Start it with:  npm run test:db
// Run only some test files by adding part of their name, e.g.:
//   npm run test:db -- booking
//
// What it does:
//   1. Starts a throwaway Postgres 17 on this computer (NOT our live Supabase).
//   2. Applies every file in supabase/migrations/ in order, like `db push` does.
//   3. Runs each *.test.mjs file in this folder on its own fresh copy.
//   4. Prints PASS / FAIL for every check, deletes the database, and exits
//      with code 1 if anything failed (so it can be used in automatic checks later).
// See supabase/tests/README.md for more.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, buildTemplate, createTestContext } from './helpers.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(testsDir, '..', 'migrations');

// All migrations, oldest first (their names start with a timestamp, so
// sorting by name = sorting by date).
const migrations = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => path.join(migrationsDir, f));

// All test files (01-..., 02-...), or only the ones matching the filter word.
const filter = process.argv[2];
const testFiles = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !filter || f.includes(filter))
  .sort();

// Every check() from every test file lands here.
const results = [];
// Test file name -> its title, for the printed headings.
const titles = {};
const started = Date.now();

console.log('Starting a throwaway Postgres 17 database...');
const server = await startServer();
let setupError = null;

try {
  console.log('Applying migrations:');
  await buildTemplate(server.port, migrations);

  for (const file of testFiles) {
    const name = file.replace('.test.mjs', '');
    const mod = await import(pathToFileURL(path.join(testsDir, file)).href);
    titles[name] = mod.title ?? name;
    console.log(`Running ${file}...`);

    const t = await createTestContext(server.port, name, results);
    try {
      await mod.default(t);
    } catch (e) {
      // A test file stopped early because of an unexpected error: that's a FAIL.
      results.push({ file: name, area: 'Crash', test: 'Test file stopped early', expected: 'no crash', got: e.stack ?? e.message, pass: false });
    } finally {
      await t.close();
    }
  }
} catch (e) {
  // Couldn't even build the database (for example a migration has an error).
  setupError = e;
} finally {
  await server.stop();
}

if (setupError) {
  console.error(`\nSETUP FAILED: ${setupError.message}`);
  process.exit(1);
}

// --- Print the results, grouped by test file and section ---------------------
let lastFile = '';
let lastArea = '';
for (const r of results) {
  if (r.file !== lastFile) {
    lastFile = r.file;
    lastArea = '';
    console.log(`\n=== ${r.file}: ${titles[r.file]} ===`);
  }
  if (r.area !== lastArea) {
    lastArea = r.area;
    console.log(`\n  -- ${r.area}`);
  }
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'} | ${r.test} | expected: ${r.expected} | got: ${r.got}`);
}

// --- Summary --------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
console.log('\n=== Summary ===');
for (const file of Object.keys(titles)) {
  const mine = results.filter((r) => r.file === file);
  const bad = mine.filter((r) => !r.pass).length;
  console.log(`  ${bad ? 'FAIL' : 'ok  '}  ${file}: ${mine.length - bad}/${mine.length} passed`);
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${seconds}s.`);
if (failed.length) {
  console.log(`${failed.length} FAILED:`);
  for (const r of failed) console.log(`  - ${r.file} > ${r.test}`);
}
process.exit(failed.length || results.length === 0 ? 1 : 0);
