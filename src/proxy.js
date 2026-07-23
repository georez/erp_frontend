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

async function verifyJwtWithAuthServer(jwt) {
  // Placeholder for actual JWT verification logic with your auth server.
  // This could involve sending a request to your auth server to validate the JWT.
  // For demonstration purposes, we'll assume the JWT is valid if it exists and is not expired.
  return true; // Replace with actual verification logic
}

async function verifyJwt(request) {
  const { pathname, search } = request.nextUrl;

  // Check if the current route is /dashboard or a sub-route (/dashboard/*)
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    const jwt = request.cookies.get('jwt')?.value;
    const isJwtValid = await verifyJwtWithAuthServer(jwt);

    if (!jwt || !isJwtValid) {
      const currentPath = pathname + search;
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', currentPath);

      return NextResponse.redirect(loginUrl);
    }
  }
}

export async function proxy(request) {
  const csrfInvalidResponse = csrfProtection(request);
  if (csrfInvalidResponse) {
    return csrfInvalidResponse;
  }

  const jwtInvalidResponse = await verifyJwt(request);
  if (jwtInvalidResponse) {
    return jwtInvalidResponse;
  }
  
  const responseNext = NextResponse.next();
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