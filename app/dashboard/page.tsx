import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard-client";

export const metadata: Metadata = { title: "My projects" };

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardClient />
    </AppShell>
  );
}
