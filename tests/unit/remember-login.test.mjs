// Unit test for "Save login next time" (src/lib/supabase/remember.ts),
// Change 17, Part C.
// Run with: npm run test:unit
//
// What it proves:
//   - "never" turns Supabase's login cookies into session cookies (no max
//     age, no expiry), so closing the browser logs the person out
//   - "never" still lets Supabase DELETE cookies (logging out keeps working)
//   - "always" leaves the cookies exactly as Supabase made them
//   - a missing or junk saved value counts as "always" (how the site worked
//     before), but a missing or junk FORM value counts as "never" (the safer
//     choice, and the one the form starts on)
//   - the preference cookie itself is a session cookie for "never"

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyRememberChoice,
  readRememberChoice,
  rememberChoiceFromForm,
  rememberCookieOptions,
} from '../../src/lib/supabase/remember.ts';

// What @supabase/ssr passes when it saves a login cookie (400 days)
const supabaseOptions = { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 * 24 * 60 * 60 };

test('"never" makes a login cookie a session cookie', () => {
  const result = applyRememberChoice({ ...supabaseOptions, expires: new Date(Date.now() + 86_400_000) }, 'never');
  assert.equal(result.maxAge, undefined);
  assert.equal(result.expires, undefined);
  // Everything else stays the same
  assert.equal(result.path, '/');
  assert.equal(result.sameSite, 'lax');
});

test('"never" still lets Supabase delete cookies', () => {
  assert.equal(applyRememberChoice({ ...supabaseOptions, maxAge: 0 }, 'never').maxAge, 0);
  const past = new Date(0);
  assert.equal(applyRememberChoice({ path: '/', expires: past }, 'never').expires, past);
});

test('"always" leaves the cookie as Supabase made it', () => {
  assert.deepEqual(applyRememberChoice(supabaseOptions, 'always'), supabaseOptions);
});

test('reading the saved choice: only "never" means never', () => {
  assert.equal(readRememberChoice('never'), 'never');
  assert.equal(readRememberChoice('always'), 'always');
  assert.equal(readRememberChoice(undefined), 'always');
  assert.equal(readRememberChoice('junk'), 'always');
});

test('reading the form: only "always" means always', () => {
  assert.equal(rememberChoiceFromForm('always'), 'always');
  assert.equal(rememberChoiceFromForm('never'), 'never');
  assert.equal(rememberChoiceFromForm(null), 'never');
  assert.equal(rememberChoiceFromForm('ALWAYS'), 'never');
});

test('the preference cookie: a session cookie for "never", 400 days for "always"', () => {
  assert.equal(rememberCookieOptions('never', true).maxAge, undefined);
  assert.equal(rememberCookieOptions('always', false).maxAge, 400 * 24 * 60 * 60);
  assert.equal(rememberCookieOptions('always', true).secure, true);
});
