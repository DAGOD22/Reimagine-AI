import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="auth-page">
      <div className="auth-brand-panel signup-art">
        <Logo />
        <div><span className="kicker light">Your renovation studio</span><h1>Start with<br />what is real.</h1><p>One photograph becomes a considered analysis, a grounded plan, and a design you can refine.</p></div>
        <div className="auth-features"><span>Visual space analysis</span><span>Versioned redesigns</span><span>Private project storage</span></div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-card">
          <span className="kicker">Create your studio</span>
          <h2>Your space, reconsidered.</h2>
          <p>Create an account to securely save projects and every iteration.</p>
          <Suspense><AuthForm mode="sign-up" /></Suspense>
        </div>
      </div>
    </main>
  );
}
