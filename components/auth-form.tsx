"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, Sparkles } from "lucide-react";
import { apiFetch, ClientApiError } from "@/lib/client/api";

const authErrors: Record<string, string> = {
  invalid_credentials: "The email or password is incorrect.",
  email_in_use: "An account already exists for this email.",
  credentials_removed: "For your security, credentials were removed from the address bar. Please submit the form again.",
  google_not_configured: "Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.",
  microsoft_not_configured: "Microsoft sign-in needs MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET on the server.",
  oauth_cancelled: "Social sign-in was cancelled.",
  oauth_state_invalid: "The social sign-in request expired. Please try again.",
  oauth_provider_unreachable: "The identity provider could not be reached. Please try again.",
  oauth_token_exchange_failed: "The identity provider could not complete sign-in.",
};

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState({ google: false, microsoft: false });

  useEffect(() => {
    const code = (params.get("oauth_error") || params.get("error") || "").toLowerCase();
    if (code) setError(authErrors[code] || "Sign-in could not be completed. Please try again.");
    apiFetch<{ providers: { google: boolean; microsoft: boolean } }>("/api/auth/providers")
      .then((result) => setProviders(result.providers))
      .catch(() => undefined);
  }, [params]);

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
  const next = params.get("next");
  const oauthNext = next?.startsWith("/") ? `?next=${encodeURIComponent(next)}` : "";
  function providerUnavailable(provider: "google" | "microsoft", event: React.MouseEvent<HTMLAnchorElement>) {
    if (providers[provider]) return;
    event.preventDefault();
    setError(
      provider === "google"
        ? authErrors.google_not_configured
        : authErrors.microsoft_not_configured,
    );
  }

  return (
    <>
      <div className="social-auth">
        <a
          href={`/api/auth/oauth/google/start${oauthNext}`}
          className={`social-button google ${!providers.google ? "not-configured" : ""}`}
          onClick={(event) => providerUnavailable("google", event)}
        >
          <GoogleIcon />
          <span>Continue with Google</span>
          {providers.google && <i />}
        </a>
        <a
          href={`/api/auth/oauth/microsoft/start${oauthNext}`}
          className={`social-button microsoft ${!providers.microsoft ? "not-configured" : ""}`}
          onClick={(event) => providerUnavailable("microsoft", event)}
        >
          <MicrosoftIcon />
          <span>Continue with Microsoft</span>
          {providers.microsoft && <i />}
        </a>
      </div>
      <div className="form-divider"><span>or use email</span></div>
      <form
        className="auth-form"
        method="post"
        action={`/api/auth/${mode}`}
        onSubmit={submit}
      >
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
        {signingUp && <p className="form-hint">Creating an account preserves your demo project and gives you private, persistent design versions.</p>}
        <button className="button button-primary button-full button-lg" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={19} /> : <>{signingUp ? "Create account" : "Sign in"}<ArrowRight size={18} /></>}
        </button>
        <p className="auth-switch">
          {signingUp ? "Already have an account?" : "New to Hearthform?"} {" "}
          <Link href={signingUp ? "/sign-in" : "/sign-up"}>{signingUp ? "Sign in" : "Create an account"}</Link>
        </p>
        <Link className="demo-auth-link" href="/demo"><Sparkles size={15} /> Try one redesign before signing in</Link>
      </form>
    </>
  );
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.5 14Z"/><path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.5l3.4 2.6A5.9 5.9 0 0 1 12 6.1Z"/></svg>;
}

function MicrosoftIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f25022" d="M2 2h9.5v9.5H2z"/><path fill="#7fba00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00a4ef" d="M2 12.5h9.5V22H2z"/><path fill="#ffb900" d="M12.5 12.5H22V22h-9.5z"/></svg>;
}
