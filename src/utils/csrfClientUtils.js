import { CSRF_TOKEN_JSON_NAME } from "@/constants";

/**
 * Deletes the existing CSRF cookie and fetches a new CSRF token from the server.
 * @param {*} setCsrfToken set function of useState to set the csrf token
 */
export async function getNewCsrfToken(setCsrfToken) {
  const res = await fetch("/csrf", {
    method: "GET",
  });
  const csrfTokenJson = await res.json();
  setCsrfToken(csrfTokenJson[CSRF_TOKEN_JSON_NAME]);
}