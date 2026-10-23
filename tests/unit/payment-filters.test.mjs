// Unit test for the Payments Filter (src/lib/payment-filters.ts), Change 17, Part G.
// Run with: npm run test:unit
//
// What it proves:
//   - status, method and month / date range filters keep the right payments
//   - "this month", "last month" and "last 3 months" use Philippine dates
//     (a payment late at night is counted on the right day)
//   - junk in the address is ignored, and swapped dates are put right

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeFilterCount,
  filterDateRange,
  filterPayments,
  paymentDay,
  readPaymentFilters,
} from '../../src/lib/payment-filters.ts';

// Some payments (paid_at in UTC, like the database gives them)
const payments = [
  { id: 1, status: 'paid', provider: 'paymongo', method: 'gcash', paid_at: '2026-10-20T02:00:00Z', created_at: '2026-10-20T01:55:00Z' },
  { id: 2, status: 'paid', provider: 'paymongo', method: 'card', paid_at: '2026-09-30T17:30:00Z', created_at: '2026-09-30T17:20:00Z' },
  { id: 3, status: 'pending', provider: 'manual', method: 'bpi', paid_at: null, created_at: '2026-10-22T05:00:00Z' },
  { id: 4, status: 'rejected', provider: 'manual', method: 'gcash', paid_at: null, created_at: '2026-08-15T05:00:00Z' },
  { id: 5, status: 'refunded', provider: 'paymongo', method: 'maya', paid_at: '2026-07-01T05:00:00Z', created_at: '2026-07-01T04:59:00Z' },
];
const today = '2026-10-23';
const ids = (list) => list.map((p) => p.id);
const run = (params) => ids(filterPayments(payments, readPaymentFilters(params), today));

test('no filters: everything', () => {
  assert.deepEqual(run({}), [1, 2, 3, 4, 5]);
  assert.equal(activeFilterCount(readPaymentFilters({})), 0);
});

test('status filter (checking = a manual transfer not approved yet)', () => {
  assert.deepEqual(run({ status: 'paid' }), [1, 2]);
  assert.deepEqual(run({ status: 'checking' }), [3]);
  assert.deepEqual(run({ status: 'rejected' }), [4]);
  assert.deepEqual(run({ status: 'refunded' }), [5]);
});

test('payment method filter', () => {
  assert.deepEqual(run({ method: 'gcash' }), [1, 4]);
  assert.deepEqual(run({ method: 'cash' }), []);
});

test('payment dates are Philippine dates', () => {
  // 30 Sep 17:30 UTC = 1 Oct 1:30 AM in Manila
  assert.equal(paymentDay(payments[1]), '2026-10-01');
  // A payment being checked uses when it was sent
  assert.equal(paymentDay(payments[2]), '2026-10-22');
});

test('this month, last month, last 3 months', () => {
  assert.deepEqual(run({ when: 'this_month' }), [1, 2, 3]);
  assert.deepEqual(filterDateRange(readPaymentFilters({ when: 'last_month' }), today), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(run({ when: 'last_month' }), []);
  assert.deepEqual(run({ when: 'last_3_months' }), [1, 2, 3, 4]);
});

test('custom dates (from / to), swapped dates put right', () => {
  assert.deepEqual(run({ when: 'custom', from: '2026-10-01', to: '2026-10-20' }), [1, 2]);
  assert.deepEqual(run({ when: 'custom', from: '2026-10-20', to: '2026-10-01' }), [1, 2]);
  assert.deepEqual(run({ when: 'custom', from: '2026-10-21' }), [3]);
  // Dates only count with "Pick dates"
  assert.deepEqual(run({ when: 'all', from: '2026-10-21' }), [1, 2, 3, 4, 5]);
});

test('junk in the address is ignored', () => {
  const filters = readPaymentFilters({ status: 'stolen', method: '<script>', when: 'yesterday', from: '2026-02-30' });
  assert.deepEqual(filters, { status: 'all', method: 'all', when: 'all', from: null, to: null });
});

test('the number on the Filter button', () => {
  assert.equal(activeFilterCount(readPaymentFilters({ status: 'paid', method: 'gcash', when: 'this_month' })), 3);
  // "Pick dates" with no dates isn't really a filter
  assert.equal(activeFilterCount(readPaymentFilters({ when: 'custom' })), 0);
});
