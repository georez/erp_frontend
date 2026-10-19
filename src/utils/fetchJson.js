import { errorMessageFromBody } from './errorMessages.js';

/**
 * Reads the message to show from a failed backend response: the Arabic message for its errorCode (errorMessages.js),
 * else the backend's errorMessage, else the status.
 */
export async function readErrorMessage(res) {
  const body = await res.json().catch(() => null);
  return errorMessageFromBody(body, res.statusText || `Request failed (${res.status})`);
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
