import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "@/components/settings-client";
import { getCurrentUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (user?.isGuest) redirect("/sign-up");
  return <AppShell><SettingsClient /></AppShell>;
}
