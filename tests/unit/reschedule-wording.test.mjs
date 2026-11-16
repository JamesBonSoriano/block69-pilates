// Unit test for the Re-schedule wording (src/lib/reschedule-wording.ts),
// Version 1.7 Prompt C.
// Run with: npm run test:unit
//
// What it proves:
//   - every old "transfer" database message in the list really exists in a
//     migration file (so a typo can't make the swap silently stop working)
//   - none of the new messages says "transfer"
//   - messages that aren't in the list come back unchanged (for example a
//     GCash / BPI payment "transfer" message)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { RESCHEDULE_MESSAGES, rescheduleWording } from '../../src/lib/reschedule-wording.ts';

// Every migration's SQL, joined, with the SQL escapes undone: '' is one
// quote, and %% is one % in a "raise exception" message.
const migrationsDir = path.join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const allSql = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  .join('\n')
  .replaceAll("''", "'")
  .replaceAll('%%', '%');

test('every old message is one a database function really raises', () => {
  for (const oldMessage of Object.keys(RESCHEDULE_MESSAGES)) {
    assert.ok(allSql.includes(oldMessage), `not found in migrations: ${oldMessage}`);
  }
});

test('the new messages never say "transfer"', () => {
  for (const [oldMessage, newMessage] of Object.entries(RESCHEDULE_MESSAGES)) {
    assert.doesNotMatch(newMessage, /transfer/i, oldMessage);
    assert.equal(rescheduleWording(oldMessage), newMessage);
  }
});

test('other messages come back unchanged', () => {
  assert.equal(rescheduleWording('Please upload a screenshot of your transfer first.'), 'Please upload a screenshot of your transfer first.');
  assert.equal(rescheduleWording('Sorry, this class is full.'), 'Sorry, this class is full.');
});
