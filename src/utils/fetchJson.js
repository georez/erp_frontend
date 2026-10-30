import { ERROR_MESSAGES, errorMessageFromBody } from './errorMessages.js';

/**
 * Reads the message to show from a failed backend response: the Arabic message for its errorCode (errorMessages.js),
 * else the backend's errorMessage, else the status. A 401 without a body (the session ended between the checks that
 * would have signed the user out) says so.
 */
export async function readErrorMessage(res) {
  const body = await res.json().catch(() => null);
  const fallback = res.status === 401 ? ERROR_MESSAGES.SESSION_ENDED : res.statusText || `Request failed (${res.status})`;
  return errorMessageFromBody(body, fallback);
}

/**
 * GET a JSON resource with the session cookies. Throws an Error carrying the message to show (readErrorMessage) on a
 * non-2xx response, so SWR reports it as `error` instead of returning the error body as data.
 */
export async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const error = new Error(await readErrorMessage(res));
    error.status = res.status;
    throw error;
  }
  return res.json();
}
