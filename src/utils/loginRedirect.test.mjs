// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterLoginPath } from './loginRedirect.js';

const ORIGIN = 'http://localhost:8080';

test('a page of the site is gone to, with its query', () => {
  assert.equal(afterLoginPath('/dashboard/sales-invoice?invoiceId=4', ORIGIN), '/dashboard/sales-invoice?invoiceId=4');
  assert.equal(afterLoginPath('/print/sales-invoice/4', ORIGIN), '/print/sales-invoice/4');
});

test('no callbackUrl, or another site however it is spelt, goes to the dashboard', () => {
  for (const url of [null, '', 'https://evil.com', '//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com',
    'javascript:alert(1)']) {
    assert.equal(afterLoginPath(url, ORIGIN), '/dashboard', JSON.stringify(url));
  }
});
