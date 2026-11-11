/** Where the login page goes when callbackUrl is missing or isn't a page of this site. */
export const DEFAULT_AFTER_LOGIN = '/dashboard';

/**
 * The page to go to after signing in: callbackUrl when it's a page of this site, else the dashboard. Read as the
 * browser would read it, against the site's origin, so no spelling of another site gets through: "//evil.com",
 * "/\evil.com" (browsers take a backslash for a slash), a tab or line break inside (browsers drop them).
 *
 * @param {string|null} callbackUrl the login page's callbackUrl param
 * @param {string} origin           the site's, e.g. window.location.origin
 * @returns {string} a path on the site, with its query and hash
 */
export function afterLoginPath(callbackUrl, origin) {
  if (!callbackUrl || !callbackUrl.startsWith('/')) {
    return DEFAULT_AFTER_LOGIN;
  }
  try {
    const target = new URL(callbackUrl, origin);
    return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : DEFAULT_AFTER_LOGIN;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}
