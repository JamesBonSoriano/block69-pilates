// Unit test for the two-logins rules (src/lib/auth/login-portal.ts),
// Revisions part 1, item 1.
// Run with: npm run test:unit
//
// What it proves:
//   - an admin account can't log in through the client login (/login), and a
//     client account can't log in through the admin login (/admin/login)
//   - every refused login shows the same "Incorrect email or password.",
//     with no hint about staff or the other login page
//   - after logging in, admins only ever land on admin pages and clients
//     never land on admin pages, whatever "next" says
//   - /admin/login is NOT a protected admin page (guests must reach it), but
//     every other /admin page is
//   - /book and /account are client-only pages; Home, About and Policies aren't
//   - guests are sent to the right login page
// (The login itself needs a real Supabase, so the actions in
// src/lib/auth/actions.ts are checked by hand in the click-through list.)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADMIN_LOGIN_PATH,
  CLIENT_LOGIN_PATH,
  isAdminPagePath,
  isClientOnlyPath,
  isWrongPortal,
  landingPath,
  loginPathFor,
  INCORRECT_LOGIN_MESSAGE,
  isHiddenLoginError,
} from '../../src/lib/auth/login-portal.ts';

test('an admin account cannot log in through the client login', () => {
  assert.equal(isWrongPortal('client', true), true);
});

test('a client account cannot log in through the admin login', () => {
  assert.equal(isWrongPortal('admin', false), true);
});

test('every refused login uses one plain message that gives nothing away', () => {
  assert.equal(INCORRECT_LOGIN_MESSAGE, 'Incorrect email or password.');
  assert.doesNotMatch(INCORRECT_LOGIN_MESSAGE, /staff|admin|login page/i);
  // Wrong password and unknown email (one Supabase code), plus the codes
  // that could hint an email exists
  assert.equal(isHiddenLoginError('invalid_credentials'), true);
  assert.equal(isHiddenLoginError('user_not_found'), true);
  assert.equal(isHiddenLoginError('user_banned'), true);
  // Other problems keep their own message (e.g. "Too many tries")
  assert.equal(isHiddenLoginError('over_request_rate_limit'), false);
  assert.equal(isHiddenLoginError(undefined), false);
});

test('each account can log in through its own login page', () => {
  assert.equal(isWrongPortal('client', false), false);
  assert.equal(isWrongPortal('admin', true), false);
});

test('admins land on the Dashboard or the admin page they asked for', () => {
  assert.equal(landingPath(true, null), '/admin');
  assert.equal(landingPath(true, '/admin/bookings?status=confirmed'), '/admin/bookings?status=confirmed');
  // Never a client page, and never back to the login page itself
  assert.equal(landingPath(true, '/account/profile'), '/admin');
  assert.equal(landingPath(true, '/book/details?session=x'), '/admin');
  assert.equal(landingPath(true, '/'), '/admin');
  assert.equal(landingPath(true, ADMIN_LOGIN_PATH), '/admin');
});

test('clients land on Home or the page they asked for, never an admin page', () => {
  assert.equal(landingPath(false, null), '/');
  assert.equal(landingPath(false, '/book/details?session=x'), '/book/details?session=x');
  assert.equal(landingPath(false, '/account/bookings'), '/account/bookings');
  assert.equal(landingPath(false, '/admin'), '/');
  assert.equal(landingPath(false, '/admin/users'), '/');
  // "/administrator" is not under /admin (whole words only)
  assert.equal(landingPath(false, '/administrator'), '/administrator');
});

test('the admin login page is open; every other admin page is protected', () => {
  assert.equal(isAdminPagePath('/admin/login'), false);
  assert.equal(isAdminPagePath('/admin'), true);
  assert.equal(isAdminPagePath('/admin/bookings/123'), true);
  assert.equal(isAdminPagePath('/administrator'), false);
  assert.equal(isAdminPagePath('/'), false);
});

test('booking and My Account are client-only; public pages are not', () => {
  for (const path of ['/book', '/book/details', '/book/pay/1', '/book/done/1', '/account', '/account/profile']) {
    assert.equal(isClientOnlyPath(path), true, path);
  }
  for (const path of ['/', '/about', '/policies', '/login', '/bookings']) {
    assert.equal(isClientOnlyPath(path), false, path);
  }
});

test('guests are sent to the right login page', () => {
  assert.equal(loginPathFor('/admin/payments'), ADMIN_LOGIN_PATH);
  assert.equal(loginPathFor('/admin'), ADMIN_LOGIN_PATH);
  assert.equal(loginPathFor('/account/profile'), CLIENT_LOGIN_PATH);
  assert.equal(loginPathFor('/book/details'), CLIENT_LOGIN_PATH);
});
