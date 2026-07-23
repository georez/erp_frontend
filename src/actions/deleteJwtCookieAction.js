'use server'

import { cookies } from 'next/headers'

import { JWT_COOKIE_NAME } from '@/constants'

export async function deleteJwtCookieAction() {
  const cookieStore = await cookies()
  const jwtCookie = cookieStore.get(JWT_COOKIE_NAME);

  if (jwtCookie) {
    cookieStore.delete(JWT_COOKIE_NAME)
  }
}