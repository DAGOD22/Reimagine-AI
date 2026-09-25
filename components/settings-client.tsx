"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, FolderKanban, LoaderCircle, LockKeyhole, Moon, Save, ShieldCheck, Sun, UserRound, WandSparkles } from "lucide-react";
import { apiFetch, ClientApiError } from "@/lib/client/api";
import { CURRENCIES } from "@/lib/constants";
import type { UserSafe } from "@/lib/types";

type Preferences = { appearance: "light" | "dark" | "system"; currency: string; units: "metric" | "imperial"; aiDetail: "concise" | "balanced" | "detailed"; privacyMode: "standard" | "strict" };
const defaults: Preferences = { appearance: "system", currency: "USD", units: "metric", aiDetail: "balanced", privacyMode: "standard" };

export function SettingsClient() {
  const [values, setValues] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [user, setUser] = useState<UserSafe | null>(null);
  const [accountName, setAccountName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfigured, setPasswordConfigured] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      apiFetch<{ preferences: Preferences; passwordConfigured: boolean }>("/api/settings"),
      apiFetch<{ user: UserSafe | null }>("/api/auth/me"),
    ]).then(([settings, account]) => {
      setValues(settings.preferences);
      setPasswordConfigured(settings.passwordConfigured);
      setUser(account.user);
      setAccountName(account.user?.name || "");
    }).catch((caught) => setError(caught instanceof ClientApiError ? caught.message : "Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, []);
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) { setValues((current) => ({ ...current, [key]: value })); setMessage(""); }
  async function save() {
    setSaving(true); setError("");
    try {
      await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(values) });
      localStorage.setItem("hearthform-theme", values.appearance);
      const dark = values.appearance === "dark" || (values.appearance === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      setMessage("Settings saved.");
    } catch (caught) { setError(caught instanceof ClientApiError ? caught.message : "Settings could not be saved."); }
    finally { setSaving(false); }
  }
  async function saveAccount() {
    setAccountSaving(true); setError(""); setMessage("");
    try {
      const data = await apiFetch<{ user: UserSafe; passwordConfigured: boolean }>("/api/account", {
        method: "PATCH",
        body: JSON.stringify({
          name: accountName,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      setUser(data.user); setPasswordConfigured(data.passwordConfigured); setCurrentPassword(""); setNewPassword(""); setMessage("Account updated.");
    } catch (caught) { setError(caught instanceof ClientApiError ? caught.message : "Account could not be updated."); }
    finally { setAccountSaving(false); }
  }
  if (loading) return <main className="settings-page"><div className="settings-loading"><LoaderCircle className="spin" /> Loading your studio settings...</div></main>;
  return (
    <main className="settings-page">
      <header className="dashboard-header"><div><span className="kicker">Your studio</span><h1>Settings</h1><p>Choose how Hearthform looks, estimates, and reasons.</p></div><button className="button button-primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} Save changes</button></header>
      {error && <div className="form-error settings-message">{error}</div>}{message && <div className="success-message settings-message"><Check size={17} /> {message}</div>}
      <div className="settings-grid">
        <section className="settings-section full account-settings">
          <div className="settings-title"><UserRound size={20} /><div><h2>Account</h2><p>Your private Hearthform identity and password.</p></div></div>
          <div className="account-settings-grid">
            <label><span>Name</span><input value={accountName} onChange={(event) => setAccountName(event.target.value)} minLength={2} maxLength={80} /></label>
            <label><span>Email</span><input value={user?.email || ""} readOnly aria-readonly="true" /></label>
            {passwordConfigured && <label><span>Current password</span><input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" placeholder="Only needed to change password" /></label>}
            <label><span>{passwordConfigured ? "New password" : "Add a password"}</span><input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={10} autoComplete="new-password" placeholder={passwordConfigured ? "At least 10 characters" : "Optional—use email sign-in too"} /></label>
          </div>
          <button className="button button-secondary account-save" onClick={saveAccount} disabled={accountSaving || accountName.trim().length < 2}>{accountSaving ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Update account</button>
        </section>
        <section className="settings-section"><div className="settings-title"><Sun size={20} /><div><h2>Appearance</h2><p>Set the visual theme for your workspace.</p></div></div><div className="choice-grid three">{(["light","dark","system"] as const).map((value) => <button key={value} className={values.appearance === value ? "selected" : ""} onClick={() => update("appearance", value)}>{value === "light" ? <Sun size={19} /> : value === "dark" ? <Moon size={19} /> : <span className="split-theme" />}<strong>{value[0].toUpperCase()+value.slice(1)}</strong>{values.appearance === value && <Check size={15} />}</button>)}</div></section>
        <section className="settings-section"><div className="settings-title"><WandSparkles size={20} /><div><h2>Design preferences</h2><p>Defaults for plans and estimates.</p></div></div><div className="settings-fields"><label><span>Default currency</span><select value={values.currency} onChange={(event) => update("currency", event.target.value)}>{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label><span>Measurement units</span><select value={values.units} onChange={(event) => update("units", event.target.value as Preferences["units"])}><option value="metric">Metric</option><option value="imperial">Imperial</option></select></label><label><span>AI plan detail</span><select value={values.aiDetail} onChange={(event) => update("aiDetail", event.target.value as Preferences["aiDetail"])}><option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option></select></label></div></section>
        <section className="settings-section full"><div className="settings-title"><LockKeyhole size={20} /><div><h2>Privacy</h2><p>Understand how external visual services receive project images.</p></div></div><div className="privacy-note"><strong>Your projects are access-controlled.</strong><p>Uploaded files are served only to your signed-in account. During analysis, selected images are sent server-to-server to OpenRouter. During generation, they are sent to the configured image-editing provider. In community image mode, a short-lived signed media link is used and expires automatically.</p></div><div className="choice-grid two"><button className={values.privacyMode === "standard" ? "selected" : ""} onClick={() => update("privacyMode", "standard")}><strong>Standard</strong><span>Allow configured providers to process project images.</span>{values.privacyMode === "standard" && <Check size={15} />}</button><button className={values.privacyMode === "strict" ? "selected" : ""} onClick={() => update("privacyMode", "strict")}><strong>Strict reminder</strong><span>Ask for confirmation before each external image-generation request.</span>{values.privacyMode === "strict" && <Check size={15} />}</button></div></section>
        <section className="settings-section full saved-project-settings"><div className="settings-title"><FolderKanban size={20} /><div><h2>Saved projects</h2><p>Projects, plans, images, versions, budgets, and notes are stored persistently and scoped to your account.</p></div></div><div><p>Manage rename, duplicate, and delete actions from your private project gallery.</p><Link href="/dashboard" className="button button-secondary"><FolderKanban size={17} /> Open My Projects</Link></div></section>
      </div>
    </main>
  );
}
