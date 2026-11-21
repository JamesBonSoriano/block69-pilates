// Unit test for the status chips and simple statuses on the admin
// Appointments page (src/lib/admin/display.ts), Version 1.6.
// Run with: npm run test:unit
//
// What it proves:
//   - only five chips: All, Pending, Confirmed, Done, Cancelled (Version 1.7:
//     no "Re-scheduled" chip)
//   - each chip asks the database for the right statuses (Confirmed also
//     for confirmed bookings whose class ended)
//   - every database status belongs to exactly one group
//   - the details page reason, e.g. "Cancelled · No-show", and (Version 1.7)
//     what the cafe gave when an admin cancelled

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

test('only the five chips, in order, "All" first with no status filter', () => {
  assert.deepEqual(STATUS_CHIPS.map((item) => item.label), ['All', 'Pending', 'Confirmed', 'Done', 'Cancelled']);
  assert.deepEqual(STATUS_CHIPS[0].statuses, []);
});

test('each chip filters on the agreed statuses', () => {
  assert.deepEqual(chip('pending').statuses, ['pending_payment', 'awaiting_verification', 'paid_needs_action']);
  assert.deepEqual(chip('confirmed').statuses, ['confirmed']);
  assert.deepEqual(chip('done').statuses, ['attended', 'pending_attendance']);
  assert.deepEqual([...chip('cancelled').statuses].sort(), ['cancelled_with_voucher', 'expired', 'forfeited', 'no_show']);
  // Version 1.7: no "Re-scheduled" chip (the old row of a re-schedule is never listed)
  assert.equal(chip('rescheduled'), undefined);
});

test('every database status is in exactly one group', () => {
  assert.deepEqual(Object.keys(GROUP_OF_STATUS).sort(), [...ALL_STATUSES].sort());
  // Every status except 'transferred' has a chip (Version 1.7)
  const inChips = STATUS_CHIPS.slice(1).flatMap((item) => item.statuses).filter((s) => s !== 'pending_attendance');
  assert.deepEqual([...inChips].sort(), ALL_STATUSES.filter((s) => s !== 'transferred').sort());
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
  assert.equal(appointmentStatus('confirmed', { attendanceDue: true }).label, 'Done');
  assert.equal(appointmentStatus('confirmed', { attendanceDue: true }).reason, 'Class ended');
  assert.equal(appointmentStatus('expired', { paymentRejected: true }).reason, 'Payment rejected');
  assert.equal(appointmentStatus('expired').reason, 'Payment time ran out');
  // Version 1.7: an admin cancel says what the cafe gave
  assert.equal(appointmentStatus('forfeited', { cafeCancel: 'refunded' }).reason, 'Refunded outside the website');
  assert.equal(appointmentStatus('cancelled_with_voucher', { cafeCancel: 'free_code' }).reason, 'Cancelled by the cafe · 100% code given');
  assert.equal(appointmentStatus('cancelled_with_voucher').reason, '50% code given');
  assert.equal(appointmentStatus('pending_payment', { holdSecondsLeft: 61 }).reason, 'Waiting for payment (2 min left)');
});
