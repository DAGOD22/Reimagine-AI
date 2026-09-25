"use client";

import Link from "next/link";
import { LogOut, Settings, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { UserSafe } from "@/lib/types";
import { apiFetch } from "@/lib/client/api";

export function HeaderAccount({ user }: { user: UserSafe | null }) {
  const router = useRouter();
  if (!user) {
    return (
      <div className="header-actions">
        <Link className="text-button hide-mobile" href="/sign-in">Sign in</Link>
        <Link className="button button-secondary button-sm hide-mobile" href="/demo">Try demo</Link>
        <Link className="button button-primary button-sm" href="/sign-up">Start redesigning</Link>
      </div>
    );
  }
  if (user.isGuest) {
    return (
      <div className="header-actions demo-account-actions">
        <span className="demo-session-chip"><Sparkles size={14} /> Demo mode</span>
        <Link className="button button-primary button-sm" href="/sign-up">Save & continue</Link>
      </div>
    );
  }
  async function signOut() {
    await apiFetch("/api/auth/sign-out", { method: "POST", body: "{}" });
    router.push("/");
    router.refresh();
  }
  return (
    <div className="account-menu">
      <Link href="/dashboard" className="account-chip" title="My projects">
        <span>{user.name.slice(0, 1).toUpperCase()}</span>
        <strong className="hide-mobile">{user.name.split(" ")[0]}</strong>
      </Link>
      <Link href="/settings" className="icon-button subtle" aria-label="Settings"><Settings size={18} /></Link>
      <button className="icon-button subtle" onClick={signOut} aria-label="Sign out"><LogOut size={18} /></button>
    </div>
  );
}
