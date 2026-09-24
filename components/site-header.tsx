import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";
import { Logo } from "@/components/logo";
import { HeaderAccount } from "@/components/header-account";

export async function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  const user = await getCurrentUser();
  return (
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        {!minimal && (
          <nav className="main-nav" aria-label="Main navigation">
            <Link href="/#capabilities">Capabilities</Link>
            <Link href="/#process">How it works</Link>
            <Link href="/dashboard">Projects</Link>
          </nav>
        )}
        <HeaderAccount user={user} />
      </div>
    </header>
  );
}
