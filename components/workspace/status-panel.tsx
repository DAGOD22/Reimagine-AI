"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, CircleDot, KeyRound, LoaderCircle, Network, ServerCrash, Settings2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import type { AiStatus } from "@/lib/types";

export type ConfigStatus = {
  openrouter: { configured: boolean; model: string; endpoint: string };
  imageGeneration: { provider: string; configured: boolean; mode: string; model: string };
  database: { configured: boolean; engine: string };
  authentication: { configured: boolean; mode: string };
};

const reasonMap: Record<string, { title: string; icon: typeof AlertTriangle; recovery: string }> = {
  OPENROUTER_API_KEY_MISSING: { title: "Missing OpenRouter API key", icon: KeyRound, recovery: "Set OPENROUTER_API_KEY on the server and restart the app." },
  OPENROUTER_AUTH_FAILED: { title: "OpenRouter authentication failure", icon: KeyRound, recovery: "Verify the server-side OpenRouter key and account access." },
  OPENROUTER_RATE_LIMIT: { title: "OpenRouter rate limit", icon: CircleDot, recovery: "The free endpoint is busy. Wait briefly, then try again." },
  OPENROUTER_INVALID_MODEL: { title: "Invalid or unavailable model", icon: Settings2, recovery: "Verify OPENROUTER_MODEL and its current OpenRouter availability." },
  OPENROUTER_INVALID_IMAGE: { title: "Invalid image input", icon: AlertTriangle, recovery: "Replace the image with a smaller JPEG or PNG, then retry." },
  OPENROUTER_NETWORK_FAILURE: { title: "OpenRouter network failure", icon: Network, recovery: "Check server connectivity and try again." },
  OPENROUTER_TIMEOUT: { title: "OpenRouter timed out", icon: Network, recovery: "Try again; free-model queues can be temporarily slow." },
  OPENROUTER_MALFORMED_RESPONSE: { title: "Malformed AI response", icon: ServerCrash, recovery: "Retry the request. No fabricated result has been substituted." },
  OPENROUTER_SCHEMA_MISMATCH: { title: "Invalid structured response", icon: ServerCrash, recovery: "Retry the request. The invalid response was rejected." },
  FAL_KEY_MISSING: { title: "Missing image-provider key", icon: KeyRound, recovery: "Set FAL_KEY or switch IMAGE_PROVIDER to pollinations." },
  IMAGE_PROVIDER_AUTH_FAILED: { title: "Image-provider authentication failure", icon: KeyRound, recovery: "Verify the configured image-provider credential." },
  IMAGE_PROVIDER_RATE_LIMIT: { title: "Image-provider rate limit", icon: CircleDot, recovery: "Wait briefly, then generate again." },
  PUBLIC_APP_URL_REQUIRED: { title: "Public image access unavailable", icon: Network, recovery: "Open the app through its live preview URL or configure APP_URL / FAL." },
  IMAGE_GENERATION_FAILED: { title: "Image generation failed", icon: ServerCrash, recovery: "Try again or check image-provider configuration." },
};

export function ErrorNotice({ code, message, onRetry, onOpenStatus }: { code?: string; message: string; onRetry?: () => void; onOpenStatus?: () => void }) {
  const reason = (code && reasonMap[code]) || { title: "Request failed", icon: AlertTriangle, recovery: "Review the development status and try again." };
  const Icon = reason.icon;
  return (
    <div className="ai-error-card" role="alert">
      <span><Icon size={20} /></span>
      <div><strong>{reason.title}</strong><p>{message}</p><small>{reason.recovery}</small><div className="error-actions">{onRetry && <button className="button button-secondary button-sm" onClick={onRetry}>Try again</button>}{onOpenStatus && <button className="text-button" onClick={onOpenStatus}>Check configuration</button>}</div></div>
    </div>
  );
}

export function DevelopmentStatus({ statuses, forceOpen = false }: { statuses: AiStatus[]; forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  useEffect(() => { apiFetch<ConfigStatus>("/api/config/status").then(setConfig).catch(() => undefined); }, []);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const latest = statuses[0];
  const healthy = config?.openrouter.configured && config?.imageGeneration.configured;
  return (
    <section className={`dev-status ${open ? "open" : ""}`}>
      <button className="dev-status-toggle" onClick={() => setOpen((value) => !value)}>
        <span className={`status-light ${latest?.status || (healthy ? "success" : "error")}`} />
        <div><strong>Development status</strong><small>{latest ? `${latest.task.replaceAll("_", " ")} · ${latest.status}` : healthy ? "Services configured" : "Configuration required"}</small></div>
        <ChevronDown size={17} />
      </button>
      {open && <div className="dev-status-body">
        <div className="config-grid">
          <ConfigLine label="AI brain" ok={Boolean(config?.openrouter.configured)} value={config?.openrouter.configured ? config.openrouter.model : "OPENROUTER_API_KEY missing"} />
          <ConfigLine label="Image editor" ok={Boolean(config?.imageGeneration.configured)} value={config ? `${config.imageGeneration.provider} · ${config.imageGeneration.mode}` : "Checking..."} />
          <ConfigLine label="Database" ok={Boolean(config?.database.configured)} value={config?.database.engine || "Checking..."} />
          <ConfigLine label="Authentication" ok={Boolean(config?.authentication.configured)} value={config?.authentication.mode || "Checking..."} />
        </div>
        <div className="request-log">
          <strong>Recent AI requests</strong>
          {!statuses.length ? <p>No AI requests yet.</p> : statuses.slice(0, 6).map((status) => <div className="request-row" key={status.id || `${status.task}-${status.timestamp}`}>
            <span>{status.status === "success" ? <Check size={14} /> : status.status === "running" ? <LoaderCircle className="spin" size={14} /> : <XCircle size={14} />}</span>
            <div><strong>{status.task.replaceAll("_", " ")}</strong><small>{status.provider}{status.model ? ` · ${status.model}` : ""}</small>{status.message && <em>{status.code}: {status.message}</em>}</div>
            <time>{status.latencyMs ? `${(status.latencyMs / 1000).toFixed(1)}s` : new Date(status.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </div>)}
        </div>
        <p className="status-footnote">Secrets are never returned to this panel. It only reports whether server configuration exists and how providers responded.</p>
      </div>}
    </section>
  );
}

function ConfigLine({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return <div><span className={ok ? "ok" : "bad"}>{ok ? <Check size={13} /> : <XCircle size={13} />}</span><p><strong>{label}</strong><small>{value}</small></p></div>;
}
