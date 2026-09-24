import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderKanban, Home, Plus, Settings, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/server/auth";
import { Logo } from "@/components/logo";
import { HeaderAccount } from "@/components/header-account";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/dashboard");
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Logo />
        <nav className="sidebar-nav">
          <Link href="/dashboard"><FolderKanban size={19} /> Projects</Link>
          <Link href="/projects/new"><Plus size={19} /> New redesign</Link>
          <Link href="/settings"><Settings size={19} /> Settings</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><Sparkles size={18} /><p><strong>Think visually.</strong><br />Each iteration keeps the current design in context.</p></div>
          <Link href="/" className="sidebar-home"><Home size={17} /> Back to site</Link>
          <HeaderAccount user={user} />
        </div>
      </aside>
      <div className="app-content">{children}</div>
      <nav className="mobile-bottom-nav" aria-label="Application navigation">
        <Link href="/dashboard"><FolderKanban size={20} /><span>Projects</span></Link>
        <Link href="/projects/new" className="mobile-create"><Plus size={22} /><span>New</span></Link>
        <Link href="/settings"><Settings size={20} /><span>Settings</span></Link>
      </nav>
    </div>
  );
}
