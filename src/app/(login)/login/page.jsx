'use client';

import deleteCsrfCookieAction from "@/actions/deleteCsrfCookieAction";
import { useEffect, useState } from "react";
import Cookies from 'js-cookie';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/constants";

export default function LoginPage() {
  const [csrfToken, setCsrfToken] = useState(null);

  useEffect(() => {
    async function getNewCsrfToken() {
      await deleteCsrfCookieAction();
      await fetch("/csrf", {
        method: "GET",
      });
      setCsrfToken(Cookies.get(CSRF_COOKIE_NAME));
    }
    getNewCsrfToken();
  }, []);

  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const username = formData.get("username");
      const password = formData.get("password");
      await fetch("/api/login", {
        method: "POST",
        headers: {
          [CSRF_HEADER_NAME]: csrfToken
        },
        body: JSON.stringify({ username, password })
      });
    }}>
      <input type="text" name="username" placeholder="Username" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit">Login</button>
    </form>
  );
}