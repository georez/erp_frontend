'use client';

import { CSRF_HEADER_NAME } from '@/constants';
import { getNewCsrfToken } from '@/utils/csrfClientUtils';
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

async function refreshTokenIfNeeded(csrfToken, router) {
  const verifyResponse = await fetch('/api/login/verify', {
    method: 'GET',
    credentials: 'include'
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
  const refreshResponse = await fetch('/api/login/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: {
      [CSRF_HEADER_NAME]: csrfToken
    }
  });

  if (refreshResponse.ok) {
    const data = await refreshResponse.json();
    if (data && data.accessToken) {
      return;
    }
  }

  router.push('/login');
}

async function loadMe(setAccessToken) {
  const response = await fetch('/api/login/verify', {
    method: 'GET',
    credentials: 'include'
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

export const AuthContext = createContext({
  accessToken: null,
  csrfToken: null
});

export default function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [csrfToken, setCsrfToken] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => refreshTokenIfNeeded(csrfToken, router), 60 * 1000);
    return () => clearInterval(interval);
  }, [csrfToken, router]);

  useEffect(() => {
    getNewCsrfToken(setCsrfToken);
  }, [setCsrfToken]);

  useEffect(() => {
    loadMe(setAccessToken);
  }, [setAccessToken]);

  return (
    <AuthContext value={{ accessToken, csrfToken }}>
      {children}
    </AuthContext>
  );
}