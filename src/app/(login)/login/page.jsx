'use client';

import { useEffect, useState } from "react";
import { CSRF_HEADER_NAME } from "@/constants";
import { useRouter, useSearchParams } from "next/navigation";
import { getNewCsrfToken } from "@/utils/csrfClientUtils";
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";

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
    setError(null);
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

    console.log("1");
    if (response.ok) {
      console.log("2", callbackUrl);
      // Refresh Server Component cache so RootLayout sees the new cookie
      router.refresh();
      router.push(callbackUrl);
    } else {
      setError("Login failed. Please check your credentials.");
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, sm: 3 },
        py: { xs: 3, sm: 4 },
        bgcolor: "background.default",
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 460, borderRadius: 3, boxShadow: 3 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
            <Typography variant="h5" component="h1" align="center" sx={{ fontWeight: 700 }}>
              تسجيل الدخول
            </Typography>

            {error && (
              <Typography color="error" variant="body2" align="center">
                {error}
              </Typography>
            )}

            <TextField
              label="اسم المستخدم"
              name="username"
              variant="outlined"
              fullWidth
              required
              autoComplete="username"
            />

            <TextField
              label="كلمة المرور"
              name="password"
              variant="outlined"
              type="password"
              fullWidth
              required
              autoComplete="current-password"
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              sx={{ py: 1.2, borderRadius: 2 }}
            >
              تسجيل دخول
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}