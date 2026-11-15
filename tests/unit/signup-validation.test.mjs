// Unit test for the sign-up and profile rules (src/lib/validation.ts),
// Change 17, Part C.
// Run with: npm run test:unit
//
// What it proves (these same functions run in the browser AND on the server):
//   - mobile: exactly 11 digits starting with 09 (spaces / dashes ignored)
//   - birthday: MM/DD/YYYY, 4-digit year, a real calendar date, 1900 to today;
//     the screenshot's "03/12/275760" fails
//   - email: only @gmail.com or @yahoo.com
//   - password: at least 8 characters
//   - checkSignupFields() reports every problem at once
//   - Version 1.6: under 18 (Philippine date) or a future birthday is
//     refused with "You must be at least 18 years old to book a class."

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGE_ERROR,
  BIRTHDAY_ERROR,
  birthdayInputProblem,
  checkSignupFields,
  isAtLeast18,
  manilaToday,
  formatBirthdayInput,
  isAllowedEmailDomain,
  isValidPhMobile,
  normalizePhMobile,
  parseBirthdayInput,
} from '../../src/lib/validation.ts';

test('mobile: 11 digits starting with 09 pass, spaces and dashes are fine', () => {
  for (const ok of ['09171234567', '0917 123 4567', '0917-123-4567', ' 0917 1234567 ']) {
    assert.equal(isValidPhMobile(ok), true, ok);
  }
  assert.equal(normalizePhMobile('0917 123-4567'), '09171234567');
});

test('mobile: anything else fails', () => {
  for (const bad of ['', '0917123456', '091712345678', '+639171234567', '9171234567', '08171234567', '0917abc4567', '(0917) 123 4567']) {
    assert.equal(isValidPhMobile(bad), false, bad);
  }
});

test('birthday: a real past MM/DD/YYYY date becomes YYYY-MM-DD', () => {
  assert.equal(parseBirthdayInput('03/12/1998'), '1998-03-12');
  assert.equal(parseBirthdayInput('02/29/2000'), '2000-02-29'); // a leap year
  assert.equal(parseBirthdayInput('01/01/1900'), '1900-01-01');
});

test('birthday: the screenshot year 275760 and other bad dates fail', () => {
  for (const bad of [
    '03/12/275760', // 6-digit year (the bug in the screenshot)
    '03/12/98', // 2-digit year
    '3/12/1998', // month without its leading zero
    '1998-03-12', // the wrong shape
    '02/30/2000', // no 30 February
    '02/29/2001', // not a leap year
    '13/01/2000', // no month 13
    '12/31/1899', // before 1900
    '01/01/2999', // in the future
    '',
  ]) {
    assert.equal(parseBirthdayInput(bad), null, bad);
  }
});

test('under-18 refused: age 18+ in Philippine time (Version 1.6)', () => {
  // 15 Nov 2026, 5:00 PM UTC = 16 Nov 2026, 1:00 AM in Manila
  const now = Date.parse('2026-11-15T17:00:00Z');
  assert.equal(manilaToday(now), '2026-11-16');
  assert.equal(isAtLeast18('2008-11-16', now), true); // 18 today (Manila date)
  assert.equal(isAtLeast18('2008-11-17', now), false); // 18 tomorrow
  assert.equal(isAtLeast18('1990-01-01', now), true);
  assert.equal(isAtLeast18('2030-01-01', now), false); // future
  // Born 29 Feb: 18 on 1 March in a year with no 29 Feb
  assert.equal(isAtLeast18('2008-02-29', Date.parse('2026-02-28T04:00:00Z')), false);
  assert.equal(isAtLeast18('2008-02-29', Date.parse('2026-03-01T04:00:00Z')), true);

  assert.equal(birthdayInputProblem('11/17/2008', now), AGE_ERROR);
  assert.equal(birthdayInputProblem('01/01/2999', now), AGE_ERROR);
  assert.equal(birthdayInputProblem('11/16/2008', now), null);
  assert.equal(birthdayInputProblem('02/30/2000', now), BIRTHDAY_ERROR);
  assert.equal(parseBirthdayInput('11/17/2008', now), null);
  assert.equal(parseBirthdayInput('11/16/2008', now), '2008-11-16');
  assert.equal(AGE_ERROR, 'You must be at least 18 years old to book a class.');
});

test('the sign-up form refuses an under-18 birthday', () => {
  const tooYoung = checkSignupFields({
    full_name: 'Juan', mobile: '09171234567', birthday: '01/01/2015', email: 'juan@gmail.com', password: 'longenough',
  });
  assert.equal(tooYoung.birthday, AGE_ERROR);
});

test('birthday: a saved date shows as MM/DD/YYYY', () => {
  assert.equal(formatBirthdayInput('1998-03-12'), '03/12/1998');
  assert.equal(formatBirthdayInput(null), '');
});

test('email: only @gmail.com and @yahoo.com are allowed', () => {
  for (const ok of ['juan@gmail.com', 'Juan.Cruz@GMAIL.COM', 'ana@yahoo.com']) {
    assert.equal(isAllowedEmailDomain(ok), true, ok);
  }
  for (const bad of ['juan@umak.edu.ph', 'juan@gmail.co', 'juan@yahoo.com.ph', 'juan@mail.gmail.com', 'gmail.com', 'juan@']) {
    assert.equal(isAllowedEmailDomain(bad), false, bad);
  }
});

test('the whole sign-up form: good details pass, bad ones are all reported', () => {
  const good = {
    full_name: 'Juan dela Cruz',
    mobile: '0917 123 4567',
    birthday: '03/12/1998',
    email: 'juan@gmail.com',
    password: 'longenough',
  };
  assert.deepEqual(checkSignupFields(good), {});

  const errors = checkSignupFields({
    full_name: '  ',
    mobile: '12345',
    birthday: '03/12/275760',
    email: 'juan@umak.edu.ph',
    password: 'short',
  });
  assert.deepEqual(Object.keys(errors).sort(), ['birthday', 'email', 'full_name', 'mobile', 'password']);
  assert.match(errors.email, /Gmail|Yahoo/);
});
