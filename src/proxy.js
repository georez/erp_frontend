import { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/constants";
import { secret, tokens } from "./utils/csrfTokens";

function csrfProtection(request) {
  // Check if this request is calling a Server Action
  const isServerAction = request.headers.has('next-action')
  const csrfTokenInCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (
    (request.method === "POST" && !isServerAction) ||
    request.method === "PUT" ||
    request.method === "DELETE" ||
    request.method === "PATCH"
  ) {
    const csrfToken = request.headers.get(CSRF_HEADER_NAME);
    if (!csrfToken || !tokens.verify(secret, csrfToken) || csrfToken !== csrfTokenInCookie) {
      return new NextResponse("Invalid CSRF token", { status: 403 });
    }
  }
}

export function proxy(request) {
  const responseNext = NextResponse.next();

  const csrfInvalidResponse = csrfProtection(request);
  if (csrfInvalidResponse) {
    return csrfInvalidResponse;
  }

  return responseNext;
}

export const config = {
  // This matcher allows filtering middleware to run on specific paths.
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}