/**
 * How the Next.js server reaches the Spring backend. Server-side only: imported by next.config.mjs (the /api
 * rewrite), src/proxy.js and the report route.
 */

// 127.0.0.1, not localhost: the backend binds IPv4 loopback only, and localhost may resolve to ::1.
// In Docker it's the backend's service name, e.g. http://backend:4000. The /api rewrite in next.config.mjs is
// fixed when the app is built, so BACKEND_URL must already be set for `next build`.
export const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

/**
 * The X-Forwarded-For header for a request the Next.js server sends to the backend on the browser's behalf,
 * so the backend sees the client's IP (added by Apache) rather than the Next.js server's. Requests that go
 * through the /api rewrite don't need this: the rewrite passes the browser's headers on unchanged.
 *
 * @param {Headers} incomingHeaders  headers of the browser's request
 * @returns {Object<string, string>} the header to spread into the request's headers; empty when the browser's
 *   request has none (e.g. in development, without Apache)
 */
export function forwardedForHeader(incomingHeaders) {
  const forwardedFor = incomingHeaders.get('x-forwarded-for');
  return forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {};
}
