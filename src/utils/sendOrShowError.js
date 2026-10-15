/** Shown when a request couldn't reach the server at all (network failure, or no CSRF token could be obtained). */
export const CONNECTION_ERROR_MESSAGE = "تعذر الاتصال بالخادم. حاول مرة أخرى.";

/**
 * Sends a request and turns a failure to reach the server into a message for the user, instead of an exception.
 *
 * fetch and csrfFetch don't return a response when the network fails or no CSRF token can be obtained; they throw.
 * Uncaught, that exception only reaches the browser console, and the button that sent the request seems to do
 * nothing: the user may think a save went through. HTTP errors (400, 500, ...) are not affected: they come back as a
 * response for the caller to check as before.
 *
 * @param {() => Promise<Response>} send  sends the request, e.g. () => csrfFetch(url, options)
 * @param {(message: string) => void} showError  shows the message, e.g. the form's setErrorMessage
 * @returns {Promise<Response|null>} the response, whatever its status; null if the request failed and the
 *   message was shown
 */
export async function sendOrShowError(send, showError) {
  try {
    return await send();
  } catch (error) {
    console.error("Request failed:", error);
    showError(CONNECTION_ERROR_MESSAGE);
    return null;
  }
}
