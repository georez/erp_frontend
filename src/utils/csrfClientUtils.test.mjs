// Run with: npm test
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createCsrfFetch } from './csrfClientUtils.js';

/*
 * A fake server standing in for global fetch: /csrf hands out token-1, token-2, ...; any other URL answers with
 * the status queued for it, or 200. Every request is recorded.
 */
let requests;
let tokensIssued;
let queuedResponses;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  requests = [];
  tokensIssued = 0;
  queuedResponses = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, token: options.headers?.['x-csrf-token'], body: options.body });
    if (url === '/csrf') {
      tokensIssued += 1;
      return Response.json({ csrfToken: `token-${tokensIssued}` });
    }
    return queuedResponses.shift() ?? new Response('ok', { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const csrfRejection = () => new Response('Invalid CSRF token', { status: 403, headers: { 'x-csrf-rejected': 'true' } });
const appRequests = () => requests.filter((request) => request.url !== '/csrf');

test('the token is fetched on first use and then reused', async () => {
  const csrfFetch = createCsrfFetch();
  await csrfFetch('/api/a', { method: 'POST' });
  await csrfFetch('/api/b', { method: 'PUT' });

  assert.equal(tokensIssued, 1);
  assert.deepEqual(appRequests().map((request) => request.token), ['token-1', 'token-1']);
});

test('requests made at the same time share one /csrf call', async () => {
  const csrfFetch = createCsrfFetch();
  await Promise.all([csrfFetch('/api/a', { method: 'POST' }), csrfFetch('/api/b', { method: 'POST' })]);
  assert.equal(tokensIssued, 1);
});

test('a rejected token is replaced and the request sent once more', async () => {
  const csrfFetch = createCsrfFetch();
  queuedResponses.push(csrfRejection());

  const response = await csrfFetch('/api/save', { method: 'POST', body: '{"a":1}' });

  assert.equal(response.status, 200);
  assert.deepEqual(appRequests(), [
    { url: '/api/save', token: 'token-1', body: '{"a":1}' },
    { url: '/api/save', token: 'token-2', body: '{"a":1}' },
  ]);
  // Later requests use the new token
  await csrfFetch('/api/next', { method: 'POST' });
  assert.equal(appRequests().at(-1).token, 'token-2');
});

test('it retries only once', async () => {
  const csrfFetch = createCsrfFetch();
  queuedResponses.push(csrfRejection(), csrfRejection());

  const response = await csrfFetch('/api/save', { method: 'POST' });

  assert.equal(response.status, 403);
  assert.equal(appRequests().length, 2);
});

test('other errors, including other 403s, are returned without a retry', async () => {
  const csrfFetch = createCsrfFetch();
  queuedResponses.push(
    Response.json({ errorMessage: 'Report query is not allowed' }, { status: 403 }),
    new Response('boom', { status: 500 }),
  );

  const forbidden = await csrfFetch('/api/report', { method: 'POST' });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(await forbidden.json(), { errorMessage: 'Report query is not allowed' }, 'body still readable');

  assert.equal((await csrfFetch('/api/other', { method: 'POST' })).status, 500);
  assert.equal(appRequests().length, 2);
  assert.equal(tokensIssued, 1);
});

test('the caller\'s own headers are kept', async () => {
  const csrfFetch = createCsrfFetch();
  let sentHeaders;
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/csrf') {
      return Response.json({ csrfToken: 'token-1' });
    }
    sentHeaders = options.headers;
    return new Response('ok');
  };

  await csrfFetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  assert.deepEqual(sentHeaders, { 'Content-Type': 'application/json', 'x-csrf-token': 'token-1' });
});

test('a failed /csrf call is not kept: the next request tries again', async () => {
  const csrfFetch = createCsrfFetch();
  let csrfCalls = 0;
  globalThis.fetch = async (url) => {
    if (url === '/csrf') {
      csrfCalls += 1;
      return csrfCalls === 1 ? new Response('down', { status: 503 }) : Response.json({ csrfToken: 'token-ok' });
    }
    return new Response('ok');
  };

  await assert.rejects(csrfFetch('/api/a', { method: 'POST' }), /Failed to get a CSRF token \(503\)/);
  assert.equal((await csrfFetch('/api/a', { method: 'POST' })).status, 200);
  assert.equal(csrfCalls, 2);
});
