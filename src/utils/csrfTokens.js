import Tokens from "csrf";

/*
 * CSRF protection, server side (src/proxy.js and the /csrf route).
 *
 * Each browser gets its own random secret, kept in an httpOnly cookie (CSRF_SECRET_COOKIE_NAME). The /csrf route
 * gives the page tokens made from that secret, and every request that changes something must send one in the
 * x-csrf-token header. A token is only valid together with the secret it was made from, so a token obtained in one
 * browser (e.g. by an attacker calling /csrf) is useless with another browser's cookies. One secret can have any
 * number of valid tokens, so tabs of the same browser don't invalidate each other's.
 *
 * Kept free of Next.js imports so it can be unit-tested with node --test.
 */

const tokens = new Tokens();

/** A new random secret for a browser that has none. */
export function createCsrfSecret() {
  return tokens.secretSync();
}

/** A token for the page, made from the browser's secret. */
export function createCsrfToken(secret) {
  return tokens.create(secret);
}

/** Whether the request's token was made from this browser's secret. False if either is missing. */
export function isValidCsrfToken(secret, token) {
  return Boolean(secret) && Boolean(token) && tokens.verify(secret, token);
}

/**
 * Whether a request needs a CSRF token: anything that can change something. Server Actions are left to Next.js,
 * which checks their Origin against the Host itself.
 */
export function needsCsrfToken(method, isServerAction) {
  return (method === "POST" && !isServerAction) || method === "PUT" || method === "DELETE" || method === "PATCH";
}

/**
 * Options of the secret cookie. SameSite=Lax rather than Strict: with Strict, the first page load after following a
 * link from another site would arrive without the cookie and get a new secret, invalidating the tokens of the tabs
 * already open. Lax still keeps the cookie off cross-site POSTs, and a cookie alone is useless without a token anyway.
 * No max-age: it lasts as long as the browser session.
 */
export function csrfSecretCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    // Same switch as the auth cookies: Secure (HTTPS only) when the app is served over HTTPS
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
  };
}
