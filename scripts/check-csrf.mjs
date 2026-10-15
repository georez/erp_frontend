// Checks the CSRF protection end to end against a real Next.js server: src/proxy.js and the /csrf route, which the
// unit tests (src/utils/csrf*.test.mjs) can't reach. Two cookie jars play two browsers.
//
// Run after a build, from the frontend folder (no backend needed):
//   npm run build
//   npm run check:csrf
//
// It starts `next start` on CHECK_CSRF_PORT (default 3100) and stops it again. A changing request that passes the
// CSRF check gets 405 from POST /csrf (the route only has GET); a rejected one gets the proxy's 403.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CHECK_CSRF_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const PASSED_CSRF = 405;
const REJECTED = 403;

let server;

before(async () => {
  if (!existsSync(path.join(FRONTEND_DIR, '.next', 'BUILD_ID'))) {
    throw new Error('No build found: run `npm run build` first');
  }
  if (await respondsAt('/login')) {
    throw new Error(`Port ${PORT} is already in use; set CHECK_CSRF_PORT to a free port`);
  }
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: FRONTEND_DIR, stdio: 'ignore' });
  await waitUntilUp();
});

after(() => {
  if (!server) {
    return;
  }
  // next start runs the server in child processes: on Windows only taskkill /T stops the whole tree
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
});

async function respondsAt(urlPath) {
  try {
    await fetch(`${BASE}${urlPath}`, { redirect: 'manual' });
    return true;
  } catch {
    return false;
  }
}

async function waitUntilUp() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await respondsAt('/login')) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`next start didn't answer on port ${PORT} within 60 seconds`);
}

/** A browser: keeps the cookies the server sets and sends them back. */
class Browser {
  cookies = new Map();

  async request(urlPath, { method = 'GET', token } = {}) {
    const headers = {};
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (token !== undefined) {
      headers['x-csrf-token'] = token;
    }
    const response = await fetch(`${BASE}${urlPath}`, { method, headers, redirect: 'manual' });
    const setCookies = response.headers.getSetCookie();
    for (const setCookie of setCookies) {
      const [nameValue] = setCookie.split(';');
      const separator = nameValue.indexOf('=');
      this.cookies.set(nameValue.slice(0, separator), nameValue.slice(separator + 1));
    }
    return { response, setCookies };
  }

  async token() {
    const { response } = await this.request('/csrf');
    return (await response.json()).csrfToken;
  }

  /** A changing request: 405 means it passed the CSRF check. */
  async post(token) {
    return (await this.request('/csrf', { method: 'POST', token })).response;
  }
}

const csrfSecretCookies = (setCookies) => setCookies.filter((cookie) => cookie.startsWith('csrf_secret='));

/** A browser that has loaded a page, plus tokens for two of its tabs. */
async function browserWithTwoTabs() {
  const browser = new Browser();
  await browser.request('/login');
  return { browser, tab1: await browser.token(), tab2: await browser.token() };
}

test('the first page load gives the browser one secret cookie, httpOnly and SameSite=Lax', async () => {
  const { setCookies } = await new Browser().request('/login');
  const secrets = csrfSecretCookies(setCookies);
  assert.equal(secrets.length, 1);
  assert.match(secrets[0], /HttpOnly/i);
  assert.match(secrets[0], /SameSite=lax/i);
});

test('/csrf reuses the secret: no new cookie, and tabs get different tokens', async () => {
  const browser = new Browser();
  await browser.request('/login');
  const { response, setCookies } = await browser.request('/csrf');
  assert.equal(csrfSecretCookies(setCookies).length, 0);
  const tab1 = (await response.json()).csrfToken;
  assert.notEqual(tab1, await browser.token());
});

test("every tab's token passes with the browser's cookie", async () => {
  const { browser, tab1, tab2 } = await browserWithTwoTabs();
  assert.equal((await browser.post(tab1)).status, PASSED_CSRF);
  assert.equal((await browser.post(tab2)).status, PASSED_CSRF);
});

test('/csrf creates the secret when it is the first request, once', async () => {
  const browser = new Browser();
  const { response, setCookies } = await browser.request('/csrf');
  assert.equal(csrfSecretCookies(setCookies).length, 1);
  assert.equal((await browser.post((await response.json()).csrfToken)).status, PASSED_CSRF);
});

test("a token from another browser is rejected, marked so csrfFetch retries", async () => {
  const { browser: mine } = await browserWithTwoTabs();
  const { tab1: attackersToken } = await browserWithTwoTabs();
  const response = await mine.post(attackersToken);
  assert.equal(response.status, REJECTED);
  assert.equal(response.headers.get('x-csrf-rejected'), 'true');
});

test('a missing cookie, a missing token or a made-up token is rejected', async () => {
  const { browser, tab1 } = await browserWithTwoTabs();
  assert.equal((await new Browser().post(tab1)).status, REJECTED, 'token without the cookie');
  assert.equal((await browser.post(undefined)).status, REJECTED, 'cookie without a token');
  assert.equal((await browser.post('made-up')).status, REJECTED, 'made-up token');
});

test('GET requests need no token', async () => {
  const { response } = await new Browser().request('/login');
  assert.equal(response.status, 200);
});
