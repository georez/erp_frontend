'use client';

import { createCsrfFetch } from '@/utils/csrfClientUtils';
import { useRouter } from 'next/navigation';
import { createContext, useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';

function expireWithinOneMinute(token) {
  try {
    const { exp } = jwtDecode(token);

    if (typeof exp !== 'number') {
      return true;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    return nowInSeconds >= exp - 60;
  } catch {
    return true;
  }
}

async function refreshTokenIfNeeded(csrfFetch, router, setAccessToken) {
  const verifyResponse = await csrfFetch('/api/login/verify', {
    method: 'POST',
    credentials: 'include',
  });

  if (verifyResponse.ok) {
    const data = await verifyResponse.json();
    if (data && data.accessToken) {
      if (!expireWithinOneMinute(data.accessToken)) {
        return;
      }
    }
  }

  // Token is invalid or expired or will expire soon, refresh it
  const refreshResponse = await csrfFetch('/api/login/refresh', {
    method: 'POST',
    credentials: 'include',
  });

  if (refreshResponse.ok) {
    const data = await refreshResponse.json();
    if (data && data.accessToken) {
      setAccessToken(data.accessToken);
      return;
    } else {
      setAccessToken(null);
    }
  }

  router.push('/login');
}

async function loadMe(csrfFetch, setAccessToken) {
  const response = await csrfFetch('/api/login/verify', {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    setAccessToken(null);
  } else {
    const data = await response.json();
    if (data && data.accessToken) {
      setAccessToken(data.accessToken);
    } else {
      setAccessToken(null);
    }
  }
}

/**
 * accessToken: the logged-in user's token (for the username), null until loaded.
 * csrfFetch: fetch for requests that change something; adds the CSRF token (see createCsrfFetch).
 */
export const AuthContext = createContext({
  accessToken: null,
  csrfFetch: createCsrfFetch(),
});

export default function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  // One for the whole page, so every component shares one token
  const [csrfFetch] = useState(() => createCsrfFetch());
  const router = useRouter();

  // Background checks: if the server can't be reached (network failure, no CSRF token), log it and keep the user
  // where they are. The check runs again a minute later; sending them to the login page would lose their work.
  useEffect(() => {
    const interval = setInterval(() => {
      refreshTokenIfNeeded(csrfFetch, router, setAccessToken)
        .catch((error) => console.warn('Session check failed; trying again in a minute', error));
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [csrfFetch, router]);

  useEffect(() => {
    loadMe(csrfFetch, setAccessToken)
      .catch((error) => console.warn('Loading the logged-in user failed', error));
  }, [csrfFetch]);

  return (
    <AuthContext value={{ accessToken, csrfFetch }}>
      {children}
    </AuthContext>
  );
}