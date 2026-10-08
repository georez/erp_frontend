/**
 * Reads the error message from a failed backend response.
 * The backend returns { errorMessage } for handled errors; anything else falls back to the status.
 */
export async function readErrorMessage(res) {
  const body = await res.json().catch(() => null);
  return body?.errorMessage || res.statusText || `Request failed (${res.status})`;
}

/**
 * GET a JSON resource with the session cookies. Throws an Error carrying the backend's
 * errorMessage on a non-2xx response, so SWR reports it as `error` instead of returning
 * the error body as data.
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
