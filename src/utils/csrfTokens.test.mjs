// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCsrfSecret,
  createCsrfToken,
  csrfSecretCookieOptions,
  isValidCsrfToken,
  needsCsrfToken,
} from './csrfTokens.js';

test("a token is valid only with the secret of the browser it was made for", () => {
  const myBrowser = createCsrfSecret();
  const attackersBrowser = createCsrfSecret();
  assert.notEqual(myBrowser, attackersBrowser, 'every browser gets its own random secret');

  const myToken = createCsrfToken(myBrowser);
  assert.ok(isValidCsrfToken(myBrowser, myToken));

  // A token the attacker got from /csrf in their own browser is useless with my cookies
  const attackersToken = createCsrfToken(attackersBrowser);
  assert.ok(!isValidCsrfToken(myBrowser, attackersToken));
});

test('one secret has any number of valid tokens, so tabs of one browser keep working', () => {
  const secret = createCsrfSecret();
  const tabs = [createCsrfToken(secret), createCsrfToken(secret), createCsrfToken(secret)];
  assert.equal(new Set(tabs).size, 3, 'each tab gets a different token');
  for (const token of tabs) {
    assert.ok(isValidCsrfToken(secret, token));
  }
});

test('a missing secret, a missing token or a made-up token is rejected', () => {
  const secret = createCsrfSecret();
  const token = createCsrfToken(secret);
  assert.ok(!isValidCsrfToken(undefined, token), 'no secret cookie');
  assert.ok(!isValidCsrfToken('', token));
  assert.ok(!isValidCsrfToken(secret, undefined), 'no token header');
  assert.ok(!isValidCsrfToken(secret, ''));
  assert.ok(!isValidCsrfToken(secret, 'made-up'));
  assert.ok(!isValidCsrfToken(secret, `${token}x`), 'a changed token');
});

test('every request that can change something needs a token, except Server Actions', () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    assert.ok(needsCsrfToken(method, false), method);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.ok(!needsCsrfToken(method, false), method);
  }
  // Next.js checks a Server Action's Origin itself
  assert.ok(!needsCsrfToken('POST', true));
});

test('the secret cookie is httpOnly, Lax and Secure only over HTTPS', () => {
  const previous = process.env.COOKIE_SECURE;
  try {
    delete process.env.COOKIE_SECURE;
    assert.deepEqual(csrfSecretCookieOptions(), { httpOnly: true, sameSite: 'lax', secure: false, path: '/' });

    process.env.COOKIE_SECURE = 'true';
    assert.equal(csrfSecretCookieOptions().secure, true);
  } finally {
    if (previous === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = previous;
    }
  }
});
