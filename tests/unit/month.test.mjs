// Unit test for the month navigator helpers (src/lib/month.ts), Change 17, Part F.
// Run with: npm run test:unit
//
// What it proves:
//   - scheduled months remain available across a new year
//   - month ranges are right, including February and leap years
//   - a month in the address that isn't allowed (or is junk) is ignored
//   - Version 1.5: the ▶ arrow's address really asks for next month

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMonths, allowedMonth, bookableMonths, formatMonth, monthArrowHref, monthOf, monthRange } from '../../src/lib/month.ts';

test('scheduled months are sorted and deduplicated across the new year', () => {
  assert.deepEqual(bookableMonths('2026-10-23', ['2026-11']), ['2026-10', '2026-11']);
  assert.deepEqual(bookableMonths('2026-12-31', ['2027-03', '2027-01', '2026-11', '2027-01']), ['2026-12', '2027-01', '2027-03']);
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
  const months = bookableMonths('2026-10-23', ['2026-11']);
  assert.equal(allowedMonth('2026-11', months), '2026-11');
  assert.equal(allowedMonth('2026-12', months), null); // two months ahead: not allowed
  assert.equal(allowedMonth('2026-09', months), null); // the past
  assert.equal(allowedMonth('junk', months), null);
  assert.equal(allowedMonth(undefined, months), null);
});

// Version 1.5 (C6): Next.js's <Form> left out the clicked arrow's
// show_month, so only the hidden month (the one already shown) was sent and
// the next arrow reloaded the same month. The arrow now builds its address
// with monthArrowHref().
test('the next arrow opens NEXT month (not the month already shown)', () => {
  // What the booking form holds when ▶ is clicked on October
  const fields = [['month', '2026-10'], ['session', 'abc-123'], ['mat', 'yes']];
  const href = monthArrowHref('/book', fields, '2026-11');
  const query = new URL(href, 'http://x').searchParams;
  assert.equal(query.get('show_month'), '2026-11');
  assert.equal(query.has('month'), false); // the old month is not sent along
  // and the picked class and the mat tick are kept
  assert.equal(query.get('session'), 'abc-123');
  assert.equal(query.get('mat'), 'yes');
  assert.ok(href.startsWith('/book?'));
});

test('the arrow drops the old date and React action fields', () => {
  const fields = [['date', '2026-10-30'], ['show_month', '2026-10'], ['$ACTION_ID_1', ''], ['booking_id', 'b1']];
  const query = new URL(monthArrowHref('/account/bookings/b1/transfer', fields, '2026-12'), 'http://x').searchParams;
  assert.deepEqual([...query.keys()].sort(), ['booking_id', 'show_month']);
  assert.equal(query.get('show_month'), '2026-12');
});

test('the month the arrow asks for is the month the page shows', () => {
  // The page reads ?show_month= and accepts it when it's next month
  const months = bookableMonths('2026-12-02', ['2026-12', '2027-01']);
  const asked = new URL(monthArrowHref('/book', [['month', months[0]]], months[1]), 'http://x').searchParams.get('show_month');
  assert.equal(allowedMonth(asked, months), '2027-01');
});

test('month names for the navigator', () => {
  assert.equal(formatMonth('2026-10'), 'October 2026');
  assert.equal(formatMonth('2027-01'), 'January 2027');
});
