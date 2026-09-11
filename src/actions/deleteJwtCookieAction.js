'use server'

import { cookies } from 'next/headers'

import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '@/constants'

export async function deleteJwtCookiesAction() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME);
  if (accessToken) {
    cookieStore.delete(ACCESS_TOKEN_COOKIE_NAME)
  }
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE_NAME);
  if (refreshToken) {
    cookieStore.delete(REFRESH_TOKEN_COOKIE_NAME)
  }
}