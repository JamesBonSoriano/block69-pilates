// Unit test for the email words (src/lib/email-text.ts), Version 1.4 admin part 2.
// Run with: npm run test:unit
//
// What it proves:
//   - every email ends with the cafe's sign-off (empty details are left out)
//   - an admin message keeps the admin's words and trims extra spaces
//   - the confirmation has the booking details (and "Choose at the cafe"
//     when no drink was picked)
//   - the email-changed alert names the new email and how to reach the cafe

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminMessageEmail, confirmationEmail, emailChangedAlert, emailSignOff } from '../../src/lib/email-text.ts';

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
