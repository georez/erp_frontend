// Run with: npm test
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createCsrfFetch } from './csrfClientUtils.js';
import { CONNECTION_ERROR_MESSAGE, sendOrShowError } from './sendOrShowError.js';

/*
 * How the forms send a request: sendOrShowError(() => csrfFetch(...), setErrorMessage). The real csrfFetch runs
 * against a fake server (global fetch), whose /csrf answer and request answer each test chooses.
 */
let csrfAnswer;
let requestAnswer;
let shown;
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

beforeEach(() => {
  csrfAnswer = () => Response.json({ csrfToken: 'token-1' });
  requestAnswer = () => new Response('{"id":"7"}', { status: 200 });
  shown = [];
  globalThis.fetch = async (url) => (url === '/csrf' ? csrfAnswer() : requestAnswer());
  console.error = () => {}; // the helper logs the failure; keep the test output clean
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

const save = () => sendOrShowError(
  () => createCsrfFetch()('/api/schemacrud/customers', { method: 'POST', body: '{}' }),
  (message) => shown.push(message),
);

test('when no CSRF token can be fetched, the message is shown instead of an exception', async () => {
  csrfAnswer = () => new Response('Service Unavailable', { status: 503 });

  const response = await save();

  assert.equal(response, null, 'the caller stops: nothing to read');
  assert.deepEqual(shown, [CONNECTION_ERROR_MESSAGE]);
});

test('when the server is unreachable, the message is shown instead of an exception', async () => {
  csrfAnswer = () => {
    throw new TypeError('fetch failed');
  };

  assert.equal(await save(), null);
  assert.deepEqual(shown, [CONNECTION_ERROR_MESSAGE]);
});

test('when the request itself fails to reach the server, the message is shown', async () => {
  requestAnswer = () => {
    throw new TypeError('fetch failed');
  };

  assert.equal(await save(), null);
  assert.deepEqual(shown, [CONNECTION_ERROR_MESSAGE]);
});

test('a successful request returns its response and shows nothing', async () => {
  const response = await save();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: '7' });
  assert.deepEqual(shown, []);
});

test('HTTP errors still come back as responses for the form to read', async () => {
  requestAnswer = () => Response.json({ errorMessage: 'Required field is missing: Name' }, { status: 400 });

  const response = await save();

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { errorMessage: 'Required field is missing: Name' });
  assert.deepEqual(shown, [], 'not a connection problem: the form shows the server\'s own message');
});
