import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CSRF_COOKIE_NAME } from "@/constants";
import { secret, tokens } from "@/utils/csrfTokens";

export async function GET(request) {
  const token = tokens.create(secret);
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60, // 1 day in seconds
    path: "/", // Make the cookie available to the entire site
  });

  return new NextResponse(null, { status: 204 });
}