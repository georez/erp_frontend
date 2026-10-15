
export const CSRF_TOKEN_JSON_NAME = "csrfToken";
export const CSRF_HEADER_NAME = "x-csrf-token";
// httpOnly cookie holding this browser's CSRF secret (see utils/csrfTokens.js)
export const CSRF_SECRET_COOKIE_NAME = "csrf_secret";
// Set on the proxy's "Invalid CSRF token" 403, so the browser can tell it apart from other 403s and retry
export const CSRF_REJECTED_HEADER = "x-csrf-rejected";

export const ACCESS_TOKEN_COOKIE_NAME = "access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";
