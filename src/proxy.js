import { NextResponse } from "next/server";
import { CSRF_HEADER_NAME, CSRF_REJECTED_HEADER, CSRF_SECRET_COOKIE_NAME } from "@/constants";
import { createCsrfSecret, csrfSecretCookieOptions, isValidCsrfToken, needsCsrfToken } from "./utils/csrfTokens";
import { BACKEND_URL, forwardedForHeader } from "./utils/backend";

// Secure cookies are only sent over HTTPS. Set COOKIE_SECURE=true wherever the app is served over HTTPS
// (together with app.cookies.secure=true in the backend); leave unset for local development over HTTP.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

/** Rejects a changing request whose token wasn't made from this browser's secret (see utils/csrfTokens.js). */
function csrfProtection(request) {
  if (!needsCsrfToken(request.method, request.headers.has('next-action'))) {
    return;
  }
  const secret = request.cookies.get(CSRF_SECRET_COOKIE_NAME)?.value;
  if (!isValidCsrfToken(secret, request.headers.get(CSRF_HEADER_NAME))) {
    // The header tells the browser's csrfFetch to get a new token and try once more (utils/csrfClientUtils.js)
    return new NextResponse("Invalid CSRF token", { status: 403, headers: { [CSRF_REJECTED_HEADER]: 'true' } });
  }
}

/**
 * Gives a browser without a CSRF secret one with this response: in practice its first page load, so the secret is
 * there before the page's JavaScript asks /csrf for a token. Not on /csrf, which creates the secret itself when it's
 * missing: both doing it would send two different secrets.
 */
function giveCsrfSecretIfMissing(request, response) {
  if (request.cookies.has(CSRF_SECRET_COOKIE_NAME) || request.nextUrl.pathname === '/csrf') {
    return;
  }
  response.cookies.set(CSRF_SECRET_COOKIE_NAME, createCsrfSecret(), csrfSecretCookieOptions());
}

async function verifyAccessTokenWithAuthServer(request, accessToken) {
  const response = await fetch(`${BACKEND_URL}/api/login/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...forwardedForHeader(request.headers),
    },
    body: JSON.stringify({ accessToken })
  });

  return response.ok;
}

async function refreshAccessTokenWithAuthServer(request) {
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const response = await fetch(`${BACKEND_URL}/api/login/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...forwardedForHeader(request.headers),
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
    const isAccessTokenValid = await verifyAccessTokenWithAuthServer(request, accessToken);

    if (!accessToken || !isAccessTokenValid) {
      const refreshedTokens = await refreshAccessTokenWithAuthServer(request);
      if (refreshedTokens) {
        const response = NextResponse.next();
        response.cookies.set('access_token', refreshedTokens.accessToken,
          { httpOnly: true, secure: COOKIE_SECURE, path: '/', maxAge: 24 * 60 * 60, sameSite: 'strict' }
        );
        response.cookies.set('refresh_token', refreshedTokens.refreshToken,
          { httpOnly: true, secure: COOKIE_SECURE, path: '/', maxAge: 24 * 60 * 60, sameSite: 'strict' });
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

  const response = (await verifyAccessToken(request)) ?? NextResponse.next();
  giveCsrfSecretIfMissing(request, response);
  return response;
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