This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

The frontend reads three environment variables. Locally, put them in `frontend/.env.local`; it is gitignored
(`.env*` in `.gitignore`), so secrets never reach git. Next.js reads the file when the dev server or
`next start` starts, so **restart after changing it**. None of these variables start with `NEXT_PUBLIC_`, so
they stay on the server and are never sent to the browser.

```properties
# frontend/.env.local
CSRF_SECRET=<random secret>
REPORT_SIGNING_SECRET=<same value as report.signing.secret in backend/secrets.properties>
# COOKIE_SECURE=true   # only when the app is served over HTTPS
```

| Variable | Required | Used by | What it is |
|---|---|---|---|
| `CSRF_SECRET` | yes | `src/utils/csrfTokens.js`, `src/proxy.js`, `/csrf` route | Secret for creating and checking CSRF tokens. Every POST/PUT/DELETE/PATCH must carry a token made with it. |
| `REPORT_SIGNING_SECRET` | yes | `src/app/custom/api/report/[reportName]/execute/route.js` | Shared with the backend: the report route signs each report request with it (HMAC-SHA256), and the backend rejects unsigned or wrongly signed requests. |
| `COOKIE_SECURE` | no (default off) | `src/proxy.js` | `true` marks the auth cookies the proxy sets as Secure (sent over HTTPS only). |

### `CSRF_SECRET`

Any random string. Generate one with OpenSSL in Git Bash:

```bash
openssl rand -base64 32 | tr -d '\r\n'
```

(`tr -d '\r\n'` removes the Windows line ending OpenSSL adds to its output.)

- **If it's missing:** the `/csrf` route fails with a 500, and every POST/PUT/DELETE/PATCH, including login,
  is rejected with `403 Invalid CSRF token`.
- **If you change it:** tokens already handed out stop working. Pages that are already open fail to save until
  they're reloaded and fetch a new token.

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

### Not configurable

The backend address is fixed to `http://127.0.0.1:4000` (in `next.config.mjs`, `src/proxy.js` and the report
route), matching the backend's `server.address` and `server.port`. It isn't read from an environment variable.

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
