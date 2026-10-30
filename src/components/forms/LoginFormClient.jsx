'use client';

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createCsrfFetch } from "@/utils/csrfClientUtils";
import { sendOrShowError } from "@/utils/sendOrShowError";
import { readErrorMessage } from "@/utils/fetchJson";
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const callbackUrl = rawCallbackUrl.startsWith('/') && !rawCallbackUrl.startsWith('//')
    ? rawCallbackUrl
    : '/dashboard';

  // The login page is outside AuthProvider, so it has its own (see createCsrfFetch)
  const [csrfFetch] = useState(() => createCsrfFetch());
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.target);
    const username = formData.get("username");
    const password = formData.get("password");
    const response = await sendOrShowError(() => csrfFetch("/api/login/signIn", {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password })
    }), setError);

    if (!response) {
      return;
    }
    if (response.ok) {
      // Refresh Server Component cache so RootLayout sees the new cookie
      router.refresh();
      router.push(callbackUrl);
    } else if (response.status === 429) {
      // Too many failed attempts for this username; the backend blocks it for a few minutes and says how many
      setError(await readErrorMessage(response));
    } else {
      setError("بيانات دخول غير صحيحة.");
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
