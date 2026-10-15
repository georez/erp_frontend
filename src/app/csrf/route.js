import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CSRF_SECRET_COOKIE_NAME, CSRF_TOKEN_JSON_NAME } from "@/constants";
import { createCsrfSecret, createCsrfToken, csrfSecretCookieOptions } from "@/utils/csrfTokens";

/**
 * A CSRF token for this browser, made from its secret cookie (see utils/csrfTokens.js). The proxy normally gives the
 * browser its secret with the first page load; if the browser still has none (e.g. the cookie was cleared), this
 * route creates it. The proxy leaves /csrf to this route, so a response never carries two different secrets.
 */
export async function GET() {
  const cookieStore = await cookies();
  const existingSecret = cookieStore.get(CSRF_SECRET_COOKIE_NAME)?.value;
  const secret = existingSecret ?? createCsrfSecret();

  const response = NextResponse.json(
    { [CSRF_TOKEN_JSON_NAME]: createCsrfToken(secret) },
    { headers: { "Cache-Control": "no-store" } },
  );
  if (!existingSecret) {
    response.cookies.set(CSRF_SECRET_COOKIE_NAME, secret, csrfSecretCookieOptions());
  }
  return response;
}
