import LoginClient from "@/components/forms/LoginFormClient";
import { connection } from "next/server";

export default async function Page() {
  await connection()
  return (
    <LoginClient />
  );
}