import { NextResponse } from "next/server";
import { CSRF_TOKEN_JSON_NAME } from "@/constants";
import { secret, tokens } from "@/utils/csrfTokens";

export async function GET(request) {
  const token = tokens.create(secret);
  return NextResponse.json({ [CSRF_TOKEN_JSON_NAME]: token });
}