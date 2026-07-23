'use client';

import { useEffect, useState } from "react";
import { CSRF_HEADER_NAME } from "@/constants";
import { useRouter, useSearchParams } from "next/navigation";
import { getNewCsrfToken } from "@/utils/csrfClientUtils";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const callbackUrl = rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')
    ? rawCallbackUrl
    : '/dashboard';

  const [csrfToken, setCsrfToken] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getNewCsrfToken(setCsrfToken);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get("username");
    const password = formData.get("password");
    const response = await fetch("/api/login/signIn", {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        [CSRF_HEADER_NAME]: csrfToken
      },
      body: JSON.stringify({ username, password })
    });

    if (response.ok) {
      // Refresh Server Component cache so RootLayout sees the new cookie
      router.refresh();
      router.push(callbackUrl);
    } else {
      setError("Login failed. Please check your credentials.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <input type="text" name="username" placeholder="Username" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit">Login</button>
    </form>
  );
}