import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { NewProjectForm } from "@/components/new-project-form";

export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage() {
  return <AppShell><NewProjectForm /></AppShell>;
}
