// Unit test for the status chips and simple statuses on the admin
// Appointments page (src/lib/admin/display.ts), Version 1.6.
// Run with: npm run test:unit
//
// What it proves:
//   - only six chips: All, Pending, Confirmed, Done, Cancelled, Re-scheduled
//   - each chip asks the database for the right statuses (Confirmed also
//     for confirmed bookings whose class ended)
//   - every database status belongs to exactly one group
//   - the details page reason, e.g. "Cancelled · No-show"

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GROUP_OF_STATUS, STATUS_CHIPS, appointmentStatus } from '../../src/lib/admin/display.ts';

// The statuses of one chip, by its key.
const chip = (key) => STATUS_CHIPS.find((item) => item.key === key);

// Every booking status in the database (the booking_status enum).
const ALL_STATUSES = [
  'pending_payment', 'awaiting_verification', 'confirmed', 'paid_needs_action', 'expired',
  'transferred', 'cancelled_with_voucher', 'forfeited', 'no_show', 'attended',
];

test('only the six chips, in order, "All" first with no status filter', () => {
  assert.deepEqual(STATUS_CHIPS.map((item) => item.label), ['All', 'Pending', 'Confirmed', 'Done', 'Cancelled', 'Re-scheduled']);
  assert.deepEqual(STATUS_CHIPS[0].statuses, []);
});

test('each chip filters on the agreed statuses', () => {
  assert.deepEqual(chip('pending').statuses, ['pending_payment', 'awaiting_verification', 'paid_needs_action']);
  assert.deepEqual(chip('confirmed').statuses, ['confirmed', 'pending_attendance']);
  assert.deepEqual(chip('done').statuses, ['attended']);
  assert.deepEqual([...chip('cancelled').statuses].sort(), ['cancelled_with_voucher', 'expired', 'forfeited', 'no_show']);
  assert.deepEqual(chip('rescheduled').statuses, ['transferred']);
});

test('every database status is in exactly one group', () => {
  assert.deepEqual(Object.keys(GROUP_OF_STATUS).sort(), [...ALL_STATUSES].sort());
  const inChips = STATUS_CHIPS.slice(1).flatMap((item) => item.statuses).filter((s) => s !== 'pending_attendance');
  assert.deepEqual([...inChips].sort(), [...ALL_STATUSES].sort());
});

test('the simple label and the exact reason', () => {
  assert.deepEqual(
    { ...appointmentStatus('no_show') },
    { group: 'cancelled', label: 'Cancelled', variant: 'error', reason: 'No-show' },
  );
  assert.equal(appointmentStatus('transferred').label, 'Re-scheduled');
  assert.equal(appointmentStatus('attended').label, 'Done');
  assert.equal(appointmentStatus('awaiting_verification').label, 'Pending');
  assert.equal(appointmentStatus('confirmed').reason, null);
  assert.equal(appointmentStatus('confirmed', { attendanceDue: true }).reason, 'Pending attendance verification');
  assert.equal(appointmentStatus('expired', { paymentRejected: true }).reason, 'Payment rejected');
  assert.equal(appointmentStatus('expired').reason, 'Payment time ran out');
  assert.equal(appointmentStatus('pending_payment', { holdSecondsLeft: 61 }).reason, 'Waiting for payment (2 min left)');
});
