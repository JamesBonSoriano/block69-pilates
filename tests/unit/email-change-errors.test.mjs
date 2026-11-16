// Unit test for the Change email reasons (src/lib/auth/email-change-errors.ts),
// Version 1.7 Prompt C.
// Run with: npm run test:unit
//
// What it proves:
//   - each common Supabase error gets its own plain reason (too many tries,
//     email not sent, address refused, email taken, no internet, bad code)
//   - an unknown error shows Supabase's own words, never the old generic
//     "Something went wrong on our side"

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMAIL_CHANGE_MESSAGES as M, emailChangeErrorMessage } from '../../src/lib/auth/email-change-errors.ts';

test('common Supabase errors get their own reason', () => {
  assert.equal(emailChangeErrorMessage({ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' }), M.tooMany);
  assert.equal(emailChangeErrorMessage({ code: 'over_request_rate_limit', message: 'x' }), M.tooMany);
  assert.equal(emailChangeErrorMessage({ status: 429, message: 'Too many requests' }), M.tooMany);
  assert.equal(emailChangeErrorMessage({ code: 'email_exists', status: 422, message: 'x' }), M.taken);
  assert.equal(emailChangeErrorMessage({ code: 'email_address_not_authorized', status: 400, message: 'x' }), M.badAddress);
  assert.equal(emailChangeErrorMessage({ code: 'reauthentication_needed', message: 'x' }), M.loginAgain);
  assert.equal(emailChangeErrorMessage({ code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' }), M.badCode);
});

test('"Error sending email change email" says the email could not be sent', () => {
  assert.equal(emailChangeErrorMessage({ code: 'unexpected_failure', status: 500, name: 'AuthApiError', message: 'Error sending email change email' }), M.notSent);
  assert.equal(emailChangeErrorMessage({ status: 500, message: 'Internal server error' }), M.notSent);
});

test('no answer from Supabase says to check the internet', () => {
  assert.equal(emailChangeErrorMessage({ name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }), M.offline);
});

test('an unknown error shows Supabase\'s own words, never the generic message', () => {
  const text = emailChangeErrorMessage({ code: 'something_new', status: 400, message: 'New email is the same as old' });
  assert.equal(text, "The email couldn't be changed: New email is the same as old.");
  assert.doesNotMatch(text, /Something went wrong/);
});
