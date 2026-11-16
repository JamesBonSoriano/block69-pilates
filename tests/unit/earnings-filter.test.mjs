// Unit test for the Earnings Method filter (src/lib/admin/earnings-filter.ts),
// Version 1.7 Prompt C.
// Run with: npm run test:unit
//
// What it proves:
//   - the choices are exactly All, PayMongo, GCash transfer, BPI transfer
//     (no Cash)
//   - each choice becomes the right provider / method for the database
//   - junk or the old "cash" in the address means All

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EARNINGS_METHOD_OPTIONS, cleanEarningsMethod, earningsMethodFilter } from '../../src/lib/admin/earnings-filter.ts';

test('the choices are exactly All, PayMongo, GCash transfer, BPI transfer', () => {
  assert.deepEqual(EARNINGS_METHOD_OPTIONS.map((o) => o.label), ['All', 'PayMongo', 'GCash transfer', 'BPI transfer']);
});

test('each choice becomes the right database filter', () => {
  assert.deepEqual(earningsMethodFilter(''), { provider: '', method: '' });
  assert.deepEqual(earningsMethodFilter('paymongo'), { provider: 'paymongo', method: '' });
  assert.deepEqual(earningsMethodFilter('gcash_transfer'), { provider: 'manual', method: 'gcash' });
  assert.deepEqual(earningsMethodFilter('bpi_transfer'), { provider: 'manual', method: 'bpi' });
});

test('junk or the old "cash" in the address means All', () => {
  for (const junk of ['cash', 'gcash', 'paypal', '__proto__', 'toString']) {
    assert.equal(cleanEarningsMethod(junk), '', junk);
  }
  assert.equal(cleanEarningsMethod('bpi_transfer'), 'bpi_transfer');
});
