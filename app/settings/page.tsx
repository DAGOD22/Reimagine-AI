import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "@/components/settings-client";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <AppShell><SettingsClient /></AppShell>;
}
