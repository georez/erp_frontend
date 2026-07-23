import { deleteCsrfCookieAction } from "@/actions/deleteCsrfCookieAction";
import Cookies from 'js-cookie';
import { CSRF_COOKIE_NAME } from "@/constants";

/**
 * Deletes the existing CSRF cookie and fetches a new CSRF token from the server.
 * @param {*} setCsrfToken set function of useState to set the csrf token
 */
export async function getNewCsrfToken(setCsrfToken) {
  await deleteCsrfCookieAction();
  await fetch("/csrf", {
    method: "GET",
  });
  setCsrfToken(Cookies.get(CSRF_COOKIE_NAME));
}