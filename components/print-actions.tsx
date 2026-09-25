"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

export function PrintActions({ projectId }: { projectId: string }) {
  return <div><Link href={`/projects/${projectId}`} className="button button-secondary"><ArrowLeft size={17} /> Back to project</Link><button className="button button-primary" onClick={() => window.print()}><Printer size={17} /> Print / save PDF</button></div>;
}
