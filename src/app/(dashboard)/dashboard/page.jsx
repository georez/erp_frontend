import DashboardClient from "@/components/dashboard/DashboardClient";
import { connection } from "next/server";

export default async function Page() {
  await connection();
  return (
    <DashboardClient />
  );
}
