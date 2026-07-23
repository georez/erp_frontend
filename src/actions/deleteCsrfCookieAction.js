'use server'

import { cookies } from 'next/headers'

import { CSRF_COOKIE_NAME } from '@/constants'

export async function deleteCsrfCookieAction() {
  const cookieStore = await cookies()
  const csrfCookie = cookieStore.get(CSRF_COOKIE_NAME);

  if (csrfCookie) {
    cookieStore.delete(CSRF_COOKIE_NAME)
  }
}