import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="auth-page">
      <div className="auth-brand-panel">
        <Logo />
        <div><span className="kicker light">A quieter way to renovate</span><h1>Make room<br />for what&apos;s next.</h1><p>See a realistic direction before the first material is ordered or wall is opened.</p></div>
        <span className="auth-quote">“Keep the architecture. Change the feeling.”</span>
      </div>
      <div className="auth-form-panel">
        <div className="auth-card">
          <span className="kicker">Welcome back</span>
          <h2>Sign in to your studio.</h2>
          <p>Return to your projects, plans, and design versions.</p>
          <Suspense><AuthForm mode="sign-in" /></Suspense>
        </div>
      </div>
    </main>
  );
}
