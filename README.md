This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

The frontend reads three environment variables. Locally, put them in `frontend/.env.local`; it is gitignored
(`.env*` in `.gitignore`), so secrets never reach git. Next.js reads the file when the dev server or
`next start` starts, so **restart after changing it**. None of these variables start with `NEXT_PUBLIC_`, so
they stay on the server and are never sent to the browser.

```properties
# frontend/.env.local
REPORT_SIGNING_SECRET=<same value as report.signing.secret in backend/secrets.properties>
# COOKIE_SECURE=true   # only when the app is served over HTTPS
# BACKEND_URL=http://backend:4000   # only when the backend isn't at http://127.0.0.1:4000 (e.g. in Docker)
```

| Variable | Required | Used by | What it is |
|---|---|---|---|
| `REPORT_SIGNING_SECRET` | yes | `src/app/custom/api/report/[reportName]/execute/route.js` | Shared with the backend: the report route signs each report request with it (HMAC-SHA256), and the backend rejects unsigned or wrongly signed requests. |
| `COOKIE_SECURE` | no (default off) | `src/proxy.js`, `src/utils/csrfTokens.js` | `true` marks the auth cookies and the CSRF secret cookie as Secure (sent over HTTPS only). |
| `BACKEND_URL` | no (default `http://127.0.0.1:4000`) | `src/utils/backend.js` | Where the Next.js server reaches the backend. Also needed by `next build`. |

### `REPORT_SIGNING_SECRET`

Must be **exactly** the same value as `report.signing.secret` in `backend/secrets.properties`. Don't generate a
new one here; copy the backend's value (from the `backend` folder in Git Bash):

```bash
grep '^report.signing.secret=' secrets.properties | cut -d= -f2-
```

If the backend doesn't have one yet, generate it with `openssl rand -hex 32 | tr -d '\r\n'` and put the same
value in both files (see `backend/README.md`).

- **If it's missing:** running a report returns `500 Report signing is not configured`.
- **If it doesn't match the backend:** every report fails with `403 Invalid report signature`. After changing
  it, restart both the frontend and the backend.

### `COOKIE_SECURE`

Leave it unset for local development over plain HTTP: browsers don't send Secure cookies over HTTP, so login
would stop working. Set `COOKIE_SECURE=true` wherever the app is served over HTTPS, **together with**
`app.cookies.secure=true` in the backend. The backend sets the same cookies on login and refresh, and the two
must agree.

### `BACKEND_URL`

Where the Next.js server reaches the backend. Defaults to `http://127.0.0.1:4000`, matching the backend's
`server.address` and `server.port`; in Docker it's the backend's service name, e.g. `http://backend:4000`. Used by
the `/api` rewrite (`next.config.mjs`), `src/proxy.js` and the report route, all through `src/utils/backend.js`.

- **Set it for `next build` as well as at runtime:** Next.js fixes rewrites when the app is built, so the `/api`
  rewrite keeps the address `next build` saw. The proxy and the report route read it when the server runs.

### Client IP (behind Apache)

Apache adds the client's IP in `X-Forwarded-For`. Requests through the `/api` rewrite pass it on unchanged, and
the requests the Next.js server makes itself (`src/proxy.js`, the report route) copy it with
`forwardedForHeader`, so the backend sees the client's IP on every request. The backend only believes the
header from the Next.js server's address (`server.tomcat.remoteip.internal-proxies`, see `backend/README.md`), so
the Next.js server must only be reachable through Apache: anyone who can reach it directly can send their own
`X-Forwarded-For`.

## CSRF protection

Every POST/PUT/DELETE/PATCH must carry a CSRF token in the `x-csrf-token` header, or `src/proxy.js` rejects it with
`403 Invalid CSRF token` (marked with an `x-csrf-rejected: true` header). Server Actions are left to Next.js, which
checks their `Origin`.

- **Each browser has its own secret**, in the httpOnly cookie `csrf_secret`: the proxy sets it on the first page load
  (or the `/csrf` route, if that comes first). Tokens from `/csrf` are made from that secret and only valid with it,
  so a token obtained in one browser is useless in another. One secret has any number of valid tokens, so tabs of
  the same browser don't interfere. No server-side secret or configuration is needed (`src/utils/csrfTokens.js`).
- **In the browser, use `csrfFetch`** for every changing request: `useContext(AuthContext).csrfFetch` in the
  dashboard, `createCsrfFetch()` outside it (the login page). It fetches a token on first use, and if the proxy
  rejects it (an expired or cleared secret cookie, a token from before a deployment), it gets a new token and sends
  the request once more (`src/utils/csrfClientUtils.js`).
- **Tests:** `npm test` covers the token rules and `csrfFetch`. Two scripts check the proxy and the `/csrf` route in a
  real server, see below.

### Checking CSRF against a running server

The unit tests can't reach `src/proxy.js` or the `/csrf` route, so two scripts check them in a real server. Both do
the same: after a build, they start `next start` on port 3100, play two browsers against it (each with its own
cookies) and stop the server again, however the run ends. No backend is needed.

```bash
npm run build                # once, and after code changes

npm run check:csrf           # Node version (scripts/check-csrf.mjs), uses the Node test runner
bash scripts/check-csrf.sh   # bash version, for a shell without npm (a server, CI); needs bash and curl
```

Set `CHECK_CSRF_PORT` to use another port, e.g. `CHECK_CSRF_PORT=3200 bash scripts/check-csrf.sh`. Both refuse to
start without a build, or if the port is already in use. They check that:

- the first page load gives the browser one `csrf_secret` cookie, httpOnly and `SameSite=Lax`;
- `/csrf` reuses that secret (no new cookie), and each tab gets a different token that passes;
- `/csrf` creates the secret itself when it's the browser's first request, once;
- a token from another browser is rejected, with `x-csrf-rejected: true` so `csrfFetch` retries;
- a token without the cookie, the cookie without a token, and a made-up token are rejected;
- `GET` requests need no token.

A request that passes the CSRF check is sent as `POST /csrf`, which the route answers with 405 (it only has `GET`),
so a 405 means "passed" and the proxy's 403 means "rejected".

`.gitattributes` keeps `*.sh` files at LF line endings, so the bash script still runs after a checkout on Windows.

## Error messages

The backend reports an error a user can cause with a code and its details
(`{ errorCode: "LINE_NEEDS_CUSTOMER", errorParams: { line: 2, … }, errorMessage: "<English>" }`, see "Error messages"
in `backend/README.md`). `src/utils/errorMessages.js` holds the Arabic message for every code, with its params as
`{placeholders}` (`'السطر {line}: …'`), and `errorMessageFromBody` picks the one to show: the code's message with its
params filled in, else the backend's English `errorMessage` (no code, a code this file doesn't know, or a param the
message needs is missing), else a fallback. Read errors through it (`readErrorMessage` in `src/utils/fetchJson.js`
does), never `errorMessage` directly.

`errorMessages.test.mjs` holds a copy of the backend's codes and the params each comes with (its `ErrorCode` enum) and
checks that every code has a message and that each message's placeholders are exactly its code's params. When a code
is added or its params change in the backend, update the copy and the message together.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
