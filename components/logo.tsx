import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("brand-logo", className)} aria-label="Hearthform home">
      <span className="brand-mark" aria-hidden="true"><span>H</span><i /></span>
      {!compact && <span className="brand-word">HEARTHFORM</span>}
    </Link>
  );
}
