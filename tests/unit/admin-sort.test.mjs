// Unit test for the admin Sort choices (src/lib/admin/sort.ts), Version 1.9.
// Run with: npm run test:unit
//
// What it proves:
//   - Earnings offers Newest first / Oldest first, newest is the default,
//     and only exactly "oldest" picks oldest (junk in the address = newest)
//   - Schedule offers soonest / latest first, soonest ("asc") is the
//     default, and only exactly "desc" picks latest first
//   - Schedule page links keep the sort and leave out the defaults

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EARNINGS_SORT_OPTIONS,
  SCHEDULE_SORT_OPTIONS,
  cleanEarningsSort,
  cleanScheduleSort,
  scheduleHref,
} from '../../src/lib/admin/sort.ts';

test('Earnings sort choices: newest first, then oldest first', () => {
  assert.deepEqual(EARNINGS_SORT_OPTIONS.map((o) => o.value), ['newest', 'oldest']);
  assert.deepEqual(EARNINGS_SORT_OPTIONS.map((o) => o.label), ['Newest first', 'Oldest first']);
});

test('Earnings ?sort= is newest unless it is exactly "oldest"', () => {
  assert.equal(cleanEarningsSort('oldest'), 'oldest');
  assert.equal(cleanEarningsSort('newest'), 'newest');
  for (const junk of [undefined, null, '', 'OLDEST', 'asc', 'desc', '__proto__', ['oldest'], 1]) {
    assert.equal(cleanEarningsSort(junk), 'newest', String(junk));
  }
});

test('Schedule sort choices: soonest first, then latest first', () => {
  assert.deepEqual(SCHEDULE_SORT_OPTIONS.map((o) => o.value), ['asc', 'desc']);
  assert.ok(SCHEDULE_SORT_OPTIONS.every((o) => o.label.startsWith('Date: ')));
});

test('Schedule ?sort= is asc unless it is exactly "desc"', () => {
  assert.equal(cleanScheduleSort('desc'), 'desc');
  assert.equal(cleanScheduleSort('asc'), 'asc');
  for (const junk of [undefined, null, '', 'DESC', 'oldest', 'newest', 'toString', ['desc'], 0]) {
    assert.equal(cleanScheduleSort(junk), 'asc', String(junk));
  }
});

test('Schedule page links keep the sort and leave out defaults', () => {
  assert.equal(scheduleHref(1, 'asc'), '/admin/schedule');
  assert.equal(scheduleHref(2, 'asc'), '/admin/schedule?page=2');
  assert.equal(scheduleHref(1, 'desc'), '/admin/schedule?sort=desc');
  assert.equal(scheduleHref(3, 'desc'), '/admin/schedule?sort=desc&page=3');
});
