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

async function verifyAccessTokenWithAuthServer(accessToken) {
  const response = await fetch('http://localhost:4000/api/login/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ accessToken })
  });

  return response.ok;
}

async function refreshAccessTokenWithAuthServer(request) {
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const response = await fetch('http://localhost:4000/api/login/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  if (response.ok) {
    const data = await response.json();
    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  }
}

async function verifyAccessToken(request) {
  const { pathname, search } = request.nextUrl;

  // Check if the current route is /dashboard or a sub-route (/dashboard/*)
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    const accessToken = request.cookies.get('access_token')?.value;
    const isAccessTokenValid = await verifyAccessTokenWithAuthServer(accessToken);

    if (!accessToken || !isAccessTokenValid) {
      const refreshedTokens = await refreshAccessTokenWithAuthServer(request);
      if (refreshedTokens) {
        const response = NextResponse.next();
        response.cookies.set('access_token', refreshedTokens.accessToken,
          { httpOnly: true, secure: false, path: '/', maxAge: 24 * 60 * 60, sameSite: 'strict' }
        );
        response.cookies.set('refresh_token', refreshedTokens.refreshToken,
          { httpOnly: true, secure: false, path: '/', maxAge: 24 * 60 * 60, sameSite: 'strict' });
        return response;
      }

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

  const jwtResponse = await verifyAccessToken(request);
  if (jwtResponse) {
    return jwtResponse;
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