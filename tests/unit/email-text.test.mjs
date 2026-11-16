// Unit test for the email words (src/lib/email-text.ts), Version 1.4 admin part 2.
// Run with: npm run test:unit
//
// What it proves:
//   - every email ends with the cafe's sign-off (empty details are left out)
//   - an admin message keeps the admin's words and trims extra spaces
//   - the confirmation has the booking details (and "Choose at the cafe"
//     when no drink was picked)
//   - the email-changed alert names the new email and how to reach the cafe
//   - (Version 1.6) the re-schedule email has the old and new class and the reason
//   - (Version 1.7) the "cafe cancelled your booking" email says what the
//     client got (100% / 50% code with its last day, no credit, refunded)
//     and never shows the admin's reason

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminMessageEmail, cafeCancelEmail, confirmationEmail, emailChangedAlert, emailSignOff, rescheduleEmail } from '../../src/lib/email-text.ts';

const cafe = { name: 'Block 69 Cafe', address: '444 Kamagong St., Comembo, Taguig City', email: 'block69cafe@gmail.com' };

test('sign-off with the cafe details, empty ones left out', () => {
  assert.equal(emailSignOff(cafe), '\n--\nBlock 69 Cafe\n444 Kamagong St., Comembo, Taguig City\nblock69cafe@gmail.com');
  assert.equal(emailSignOff({ ...cafe, address: ' ' }), '\n--\nBlock 69 Cafe\nblock69cafe@gmail.com');
});

test('admin message: the words as typed, trimmed, with the sign-off', () => {
  const email = adminMessageEmail('  Class moved  ', '  See you at 10:15!  ', cafe);
  assert.equal(email.subject, 'Class moved');
  assert.ok(email.text.startsWith('See you at 10:15!\n\n--\nBlock 69 Cafe'));
});

test('confirmation: booking details', () => {
  const details = {
    name: 'Ana Cruz',
    reference: 'B69-3F9A1C2D',
    classDate: 'Thursday, October 29',
    classTime: '9:00 – 9:50 AM',
    drink: null,
    matRental: true,
    total: '₱550',
  };
  const email = confirmationEmail(details, cafe);
  assert.equal(email.subject, 'Your Mat Pilates booking at Block 69 Cafe: Thursday, October 29');
  for (const part of ['Hi Ana Cruz,', 'Booking: B69-3F9A1C2D', 'Time: 9:00 – 9:50 AM', 'Drink: Choose at the cafe', 'Mat rental: Yes', 'Total: ₱550']) {
    assert.ok(email.text.includes(part), `missing "${part}"`);
  }
  assert.ok(confirmationEmail({ ...details, name: null, drink: 'Iced Matcha' }, cafe).text.startsWith('Hi,\n'));
});

test('email changed alert: new email and who to contact', () => {
  const email = emailChangedAlert('Ana', 'ana.new@gmail.com', cafe);
  assert.equal(email.subject, 'Your Block 69 Cafe email was changed');
  assert.ok(email.text.includes('changed to ana.new@gmail.com'));
  assert.ok(email.text.includes('contact us right away at block69cafe@gmail.com'));
});

test('re-schedule email: old class, new class and the reason', () => {
  const email = rescheduleEmail({
    name: 'Ana',
    reference: 'B69-77AB01CD',
    fromClass: 'Thursday, November 19 · 9:00 – 9:50 AM',
    toClass: 'Saturday, November 21 · 10:15 – 11:05 AM',
    reason: '  Instructor is sick  ',
  }, cafe);
  assert.equal(email.subject, 'Your Mat Pilates class was re-scheduled: Saturday, November 21 · 10:15 – 11:05 AM');
  for (const part of ['Hi Ana,', 'From: Thursday, November 19', 'To: Saturday, November 21', 'Booking: B69-77AB01CD', 'Reason: Instructor is sick' + String.fromCharCode(10), 'nothing more to pay']) {
    assert.ok(email.text.includes(part), `missing "${part}"`);
  }
  assert.ok(email.text.endsWith('block69cafe@gmail.com'));
});

// Version 1.7: the email after an admin cancels one booking
test('cafe cancel email: what the client got, for each choice', () => {
  const base = { name: 'Ana', reference: 'B69-77AB01CD', classLabel: 'Thursday, November 19 · 9:00 – 9:50 AM' };
  const free = cafeCancelEmail({ ...base, outcome: 'free_code', code: 'FREE-1A2B3C', codeExpires: 'January 18, 2027' }, cafe);
  assert.equal(free.subject, 'Your Mat Pilates booking was cancelled: Thursday, November 19 · 9:00 – 9:50 AM');
  for (const part of ['Hi Ana,', 'Booking: B69-77AB01CD', 'FREE-1A2B3C', 'one class for free', 'until January 18, 2027', 'My Vouchers']) {
    assert.ok(free.text.includes(part), `missing "${part}"`);
  }
  const half = cafeCancelEmail({ ...base, outcome: 'half_code', code: 'HALF-1A2B3C', codeExpires: 'January 18, 2027' }, cafe);
  assert.ok(half.text.includes('HALF-1A2B3C gives you 50% off'));
  const none = cafeCancelEmail({ ...base, outcome: 'no_credit', code: null, codeExpires: null }, cafe);
  assert.ok(none.text.includes('no credit'));
  assert.ok(!none.text.includes('My Vouchers'));
  const refunded = cafeCancelEmail({ ...base, name: null, outcome: 'refunded', code: null, codeExpires: null }, cafe);
  assert.ok(refunded.text.startsWith('Hi,'));
  assert.ok(refunded.text.includes('refunded your payment'));
  assert.ok(!refunded.text.includes('Reason'), 'the admin reason is never in the email');
  assert.ok(refunded.text.endsWith('block69cafe@gmail.com'));
});
