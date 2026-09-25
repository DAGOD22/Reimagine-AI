import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard-client";
import { getCurrentUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "My projects" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  return (
    <AppShell>
      <DashboardClient isGuest={Boolean(user?.isGuest)} />
    </AppShell>
  );
}
