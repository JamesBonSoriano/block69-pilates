// Unit test for the month navigator helpers (src/lib/month.ts), Change 17, Part F.
// Run with: npm run test:unit
//
// What it proves:
//   - only this month and next month can be shown (also across a new year)
//   - month ranges are right, including February and leap years
//   - a month in the address that isn't allowed (or is junk) is ignored

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonths, allowedMonth, bookableMonths, formatMonth, monthOf, monthRange } from '../../src/lib/month.ts';

test('this month and next month, also across the new year', () => {
  assert.deepEqual(bookableMonths('2026-10-23'), ['2026-10', '2026-11']);
  assert.deepEqual(bookableMonths('2026-12-31'), ['2026-12', '2027-01']);
  assert.equal(monthOf('2026-10-29'), '2026-10');
  assert.equal(addMonths('2027-01', -1), '2026-12');
});

test('first and last day of a month', () => {
  assert.deepEqual(monthRange('2026-11'), { first: '2026-11-01', last: '2026-11-30' });
  assert.deepEqual(monthRange('2027-02'), { first: '2027-02-01', last: '2027-02-28' });
  assert.deepEqual(monthRange('2028-02'), { first: '2028-02-01', last: '2028-02-29' }); // leap year
  assert.deepEqual(monthRange('2026-12'), { first: '2026-12-01', last: '2026-12-31' });
});

test('only an allowed month from the address is used', () => {
  const months = bookableMonths('2026-10-23');
  assert.equal(allowedMonth('2026-11', months), '2026-11');
  assert.equal(allowedMonth('2026-12', months), null); // two months ahead: not allowed
  assert.equal(allowedMonth('2026-09', months), null); // the past
  assert.equal(allowedMonth('junk', months), null);
  assert.equal(allowedMonth(undefined, months), null);
});

test('month names for the navigator', () => {
  assert.equal(formatMonth('2026-10'), 'October 2026');
  assert.equal(formatMonth('2027-01'), 'January 2027');
});
