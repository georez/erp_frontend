import { CSRF_HEADER_NAME, CSRF_REJECTED_HEADER, CSRF_TOKEN_JSON_NAME } from "../constants.js";

/** Gets a CSRF token for this browser from the /csrf route (see utils/csrfTokens.js). */
export async function fetchCsrfToken() {
  const response = await fetch("/csrf", { cache: "no-store", credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to get a CSRF token (${response.status})`);
  }
  return (await response.json())[CSRF_TOKEN_JSON_NAME];
}

/**
 * Creates a `fetch` for requests that change something (POST, PUT, DELETE, PATCH): it adds the CSRF token header.
 *
 * - The token is fetched on first use and reused after that; requests made at the same time share one /csrf call.
 * - If the proxy rejects the token (a 403 marked with the x-csrf-rejected header), it gets a new token and sends the
 *   request once more. That covers a token that no longer matches the browser's secret: a token from before this
 *   scheme existed, a secret cookie that expired or was cleared, or two first visits racing to create the secret.
 *   Any other response, including other 403s, is returned as it is.
 *
 * The body is sent again on a retry, so it must be something that can be sent twice, such as a string.
 * Create one per page (AuthProvider provides it to the dashboard; the login page creates its own).
 *
 * @returns {(url: string, options?: RequestInit) => Promise<Response>}
 */
export function createCsrfFetch() {
  let tokenPromise = null;

  const currentToken = () => {
    // A failed /csrf call isn't kept, so the next request tries again
    tokenPromise ??= fetchCsrfToken().catch((error) => {
      tokenPromise = null;
      throw error;
    });
    return tokenPromise;
  };

  return async function csrfFetch(url, options = {}) {
    const send = async () => fetch(url, {
      ...options,
      headers: { ...options.headers, [CSRF_HEADER_NAME]: await currentToken() },
    });

    const response = await send();
    if (response.status !== 403 || response.headers.get(CSRF_REJECTED_HEADER) !== "true") {
      return response;
    }
    tokenPromise = null;
    return send();
  };
}
