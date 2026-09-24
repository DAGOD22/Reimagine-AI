"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { apiFetch, ClientApiError } from "@/lib/client/api";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      await apiFetch(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
      const next = params.get("next");
      router.push(next?.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ClientApiError ? caught.message : "Authentication failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const signingUp = mode === "sign-up";
  return (
    <form className="auth-form" onSubmit={submit}>
      {error && <div className="form-error" role="alert">{error}</div>}
      {signingUp && <label><span>Name</span><input name="name" autoComplete="name" required minLength={2} placeholder="Your name" /></label>}
      <label><span>Email</span><input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
      <label>
        <span>Password</span>
        <div className="password-field">
          <input name="password" type={showPassword ? "text" : "password"} autoComplete={signingUp ? "new-password" : "current-password"} required minLength={signingUp ? 10 : 1} placeholder={signingUp ? "At least 10 characters" : "Your password"} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
      </label>
      {signingUp && <p className="form-hint">By creating an account, you agree to use generated designs as planning inspiration and verify all work with qualified professionals.</p>}
      <button className="button button-primary button-full button-lg" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={19} /> : <>{signingUp ? "Create account" : "Sign in"}<ArrowRight size={18} /></>}
      </button>
      <p className="auth-switch">
        {signingUp ? "Already have an account?" : "New to Hearthform?"} {" "}
        <Link href={signingUp ? "/sign-in" : "/sign-up"}>{signingUp ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
