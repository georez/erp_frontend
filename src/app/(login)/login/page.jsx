'use client';

import { useEffect, useState } from "react";
import { CSRF_HEADER_NAME } from "@/constants";
import { useRouter } from "next/navigation";
import { getNewCsrfToken } from "@/utils/csrfClientUtils";

export default function LoginPage() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState(null);

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
        [CSRF_HEADER_NAME]: csrfToken
      },
      body: JSON.stringify({ username, password })
    });

    if (response.ok) {
      router.push("/dashboard");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" name="username" placeholder="Username" required />
      <input type="password" name="password" placeholder="Password" required />
      <button type="submit">Login</button>
    </form>
  );
}