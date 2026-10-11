// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forwardedForHeader } from './backend.js';

test("the browser's X-Forwarded-For is passed on to the backend", () => {
  // As Apache sends it: whatever the client claimed, then the address Apache saw
  const headers = new Headers({ 'x-forwarded-for': '198.51.100.1, 203.0.113.7' });
  assert.deepEqual(forwardedForHeader(headers), { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' });
});

test('nothing is added when the browser request has no X-Forwarded-For', () => {
  assert.deepEqual(forwardedForHeader(new Headers()), {});
  assert.deepEqual(forwardedForHeader(new Headers({ 'x-forwarded-for': '' })), {});
});

test('the backend address defaults to the local backend and can be set with BACKEND_URL', async () => {
  const previous = process.env.BACKEND_URL;
  try {
    delete process.env.BACKEND_URL;
    const local = await import(`./backend.js?default=${Date.now()}`);
    assert.equal(local.BACKEND_URL, 'http://127.0.0.1:4000');

    process.env.BACKEND_URL = 'http://backend:4000';
    const docker = await import(`./backend.js?docker=${Date.now()}`);
    assert.equal(docker.BACKEND_URL, 'http://backend:4000');
  } finally {
    if (previous === undefined) {
      delete process.env.BACKEND_URL;
    } else {
      process.env.BACKEND_URL = previous;
    }
  }
});
