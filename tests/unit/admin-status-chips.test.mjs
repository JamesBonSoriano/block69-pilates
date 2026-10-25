// Unit test for the status chips on the admin Bookings page
// (STATUS_CHIPS in src/lib/admin/display.ts), Version 1.4.
// Run with: npm run test:unit
//
// What it proves:
//   - there are no "Attended" or "No-show" chips any more
//   - "Forfeited" lists forfeited AND no-show bookings ("No-shows
//     automatically forfeit their booking")
//   - every chip key is different, and "All" (every status) is first

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATUS_CHIPS } from '../../src/lib/admin/display.ts';

test('no Attended or No-show chips', () => {
  const keys = STATUS_CHIPS.map((chip) => chip.key);
  assert.equal(keys.includes('attended'), false);
  assert.equal(keys.includes('no_show'), false);
});

test('Forfeited also lists no-show bookings', () => {
  const forfeited = STATUS_CHIPS.find((chip) => chip.key === 'forfeited');
  assert.ok(forfeited);
  assert.deepEqual([...forfeited.statuses].sort(), ['forfeited', 'no_show']);
});

test('chip keys are unique and "All" comes first with no status filter', () => {
  const keys = STATUS_CHIPS.map((chip) => chip.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(STATUS_CHIPS[0].key, 'all');
  assert.deepEqual(STATUS_CHIPS[0].statuses, []);
});
