import { readErrorMessage } from '@/utils/fetchJson';
import { sendOrShowError } from '@/utils/sendOrShowError';

/**
 * Sends a request to the users and roles endpoints, with a JSON body if given. Resolves to the response's JSON (true
 * for an empty one) when it succeeds; else shows why with showError and resolves to null.
 */
export async function sendJson(csrfFetch, url, method, body, showError) {
  const response = await sendOrShowError(() => csrfFetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), showError);
  if (!response) {
    return null;
  }
  if (!response.ok) {
    showError(await readErrorMessage(response));
    return null;
  }
  const text = await response.text();
  return text === '' ? true : JSON.parse(text);
}
