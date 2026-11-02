// Unit test for the status chips on the admin Bookings page
// (STATUS_CHIPS in src/lib/admin/display.ts), Version 1.5.
// Run with: npm run test:unit
//
// What it proves:
//   - "Attended" and "No-show" chips exist, each for its own status
//   - "Forfeited" lists only forfeited bookings (no-shows have their own chip)
//   - "Needs action" includes bookings pending attendance verification, and
//     "Confirmed" doesn't
//   - every chip key is different, and "All" (every status) is first

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATUS_CHIPS } from '../../src/lib/admin/display.ts';

// The statuses of one chip, by its key.
const chip = (key) => STATUS_CHIPS.find((item) => item.key === key);

test('Attended and No-show chips, each for its own status', () => {
  assert.deepEqual(chip('attended')?.statuses, ['attended']);
  assert.deepEqual(chip('no_show')?.statuses, ['no_show']);
});

test('Forfeited lists only forfeited bookings now', () => {
  assert.deepEqual(chip('forfeited')?.statuses, ['forfeited']);
});

test('Needs action includes pending attendance; Confirmed does not', () => {
  assert.ok(chip('needs_action')?.statuses.includes('pending_attendance'));
  assert.ok(chip('needs_action')?.statuses.includes('awaiting_verification'));
  assert.ok(chip('needs_action')?.statuses.includes('paid_needs_action'));
  assert.deepEqual(chip('confirmed')?.statuses, ['confirmed']);
});

test('chip keys are unique and "All" comes first with no status filter', () => {
  const keys = STATUS_CHIPS.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(STATUS_CHIPS[0].key, 'all');
  assert.deepEqual(STATUS_CHIPS[0].statuses, []);
});
