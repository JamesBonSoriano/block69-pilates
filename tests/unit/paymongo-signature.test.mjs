// Unit test for the PayMongo webhook signature check
// (src/lib/paymongo-signature.ts).
// Run with: npm run test:unit
// It uses Node's built-in test runner (node --test) and Node's own
// TypeScript support, so nothing extra needs installing.
//
// What it proves: a correctly signed body passes, and a body changed by even
// one character, a wrong secret, a live-mode-only header, and junk headers
// all fail.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { isValidPaymongoSignature, parseSignatureHeader } from '../../src/lib/paymongo-signature.ts';

// A made-up webhook secret and a body shaped like a real PayMongo event.
const SECRET = 'whsk_test_made_up_secret_for_tests';
const BODY = JSON.stringify({
  data: { id: 'evt_123', type: 'event', attributes: { type: 'checkout_session.payment.paid', livemode: false } },
});
const T = '1761200000';

// Signs a body the way PayMongo does: HMAC-SHA256 of "<t>.<body>", as hex.
// Takes: the body and the secret (defaults above). Gives back: the hex signature.
function sign(body = BODY, secret = SECRET) {
  return createHmac('sha256', secret).update(`${T}.${body}`).digest('hex');
}

test('a correctly signed test-mode webhook passes', () => {
  assert.equal(isValidPaymongoSignature(BODY, `t=${T},te=${sign()},li=`, SECRET), true);
});

test('the same signature with a changed body fails', () => {
  const changed = BODY.replace('evt_123', 'evt_124');
  assert.equal(isValidPaymongoSignature(changed, `t=${T},te=${sign()},li=`, SECRET), false);
});

test('a changed timestamp fails', () => {
  assert.equal(isValidPaymongoSignature(BODY, `t=1761200001,te=${sign()},li=`, SECRET), false);
});

test('a signature made with another secret fails', () => {
  assert.equal(isValidPaymongoSignature(BODY, `t=${T},te=${sign(BODY, 'wrong')},li=`, SECRET), false);
});

test('a live-mode signature does not count (we are in test mode)', () => {
  assert.equal(isValidPaymongoSignature(BODY, `t=${T},te=,li=${sign()}`, SECRET), false);
});

test('missing or junk headers fail', () => {
  assert.equal(isValidPaymongoSignature(BODY, null, SECRET), false);
  assert.equal(isValidPaymongoSignature(BODY, '', SECRET), false);
  assert.equal(isValidPaymongoSignature(BODY, 'hello', SECRET), false);
  assert.equal(isValidPaymongoSignature(BODY, `t=${T},te=xyz,li=`, SECRET), false);
  assert.equal(isValidPaymongoSignature(BODY, `t=${T},te=${sign()},li=`, ''), false);
});

test('the header is read into its three parts', () => {
  assert.deepEqual(parseSignatureHeader('t=1,te=ab,li=cd'), { t: '1', te: 'ab', li: 'cd' });
});
