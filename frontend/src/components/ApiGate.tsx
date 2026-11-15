import { useState } from "react";
import { Check, Copy, Database, LoaderCircle, RefreshCw, Server, Terminal } from "lucide-react";
import { getApiBaseUrl, setApiBaseUrl } from "../lib/api";
import { loadCatalog, useCatalog } from "../lib/catalog";
import { initAccount } from "../lib/account";
import { Logo } from "./Header";
import { btnClass } from "./ui";

const COMMANDS = [
  {
    label: "1 · Generate the two server-side secrets (never commit them)",
    cmd: "openssl rand -base64 32   # LAORVIA_SECURITY_KEK\nopenssl rand -base64 48   # LAORVIA_SECURITY_IP_PEPPER",
  },
  {
    label: "2 · Seed Redis with the catalogue, editorial, pricing and demo account",
    cmd: "node scripts/seed-redis.mjs",
  },
  {
    label: "3 · Start the Spring Boot 4.1.2 API (serve the frontend over HTTPS)",
    cmd: "cd backend && mvn spring-boot:run",
  },
];

export function ApiGate({ onRetry }: { onRetry: () => Promise<void> }) {
  const { status, error, errorCode } = useCatalog();
  const [url, setUrl] = useState(getApiBaseUrl);
  const [retrying, setRetrying] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-5">
        <div className="text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <p className="mt-6 flex items-center justify-center gap-2.5 text-sm font-medium text-ink-600">
            <LoaderCircle className="size-4 animate-spin text-pine-600" aria-hidden />
            Connecting to Laorvia Spring Boot 4.1.2 API &amp; Redis…
          </p>
          <p className="mt-1.5 font-mono text-xs text-ink-400">{getApiBaseUrl()}</p>
        </div>
      </div>
    );
  }

  const reconnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setRetrying(true);
    setApiBaseUrl(url);
    await onRetry();
    setRetrying(false);
  };

  const copy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      window.setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-dvh bg-paper px-5 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Logo />

        <div className="mt-8 rounded-[2rem] border border-sand-200 bg-white p-6 shadow-lift sm:p-9">
          <div className="inline-flex items-center gap-2 rounded-full bg-ember-50 px-3 py-1 text-xs font-bold text-ember-700">
            <Database className="size-3.5" aria-hidden />
            {errorCode?.startsWith("SECURITY_") ? "Encrypted Channel Refused" : "Encrypted API Offline or Unseeded"}
          </div>

          <h1 className="display mt-4 text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.06]">
            The encrypted channel could not open.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
            Laorvia carries <strong>zero static data</strong>. Every response is encrypted with
            <strong> AES-256-GCM</strong> over an ephemeral <strong>ECDH P-256 / HKDF-SHA256</strong> channel, and every
            request is HMAC-signed, replay-protected and locked to this device, IP and customer session.
            TLS is mandatory. Start the Spring Boot 4.1.2 service and populate Redis to continue.
          </p>

          {error && (
            <div role="alert" className="mt-5 rounded-2xl border border-ember-100 bg-ember-50/70 p-4 text-sm text-ember-700">
              {error}
            </div>
          )}

          <form onSubmit={reconnect} className="mt-6 space-y-3">
            <label htmlFor="api-base-url" className="block text-sm font-semibold">
              Spring Boot 4.1.2 API Base URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="api-base-url"
                className="field font-mono text-sm"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:8080/api/v1"
              />
              <button type="submit" disabled={retrying} className={btnClass("primary", "md", "shrink-0")}>
                <RefreshCw className={`size-4 ${retrying ? "animate-spin" : ""}`} aria-hidden />
                {retrying ? "Connecting…" : "Retry Connection"}
              </button>
            </div>
          </form>

          <div className="mt-8 border-t border-sand-200 pt-6">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pine-700">
              <Terminal className="size-4" aria-hidden /> Start Redis + Seed Script + Spring Boot 4.1.2
            </p>
            <div className="mt-4 space-y-3">
              {COMMANDS.map((item, idx) => (
                <div key={item.label} className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
                  <p className="text-xs font-semibold text-ink-600">{item.label}</p>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-ink px-3.5 py-2.5 text-xs text-white">
                    <code className="overflow-x-auto font-mono">{item.cmd}</code>
                    <button
                      type="button"
                      onClick={() => copy(item.cmd, idx)}
                      className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/20"
                      aria-label="Copy command"
                    >
                      {copiedIdx === idx ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 rounded-xl bg-sand-50 p-3 text-xs leading-relaxed text-ink-600">
            Local HTTP only (never production): also export <code className="font-mono">LAORVIA_TLS_REQUIRED=false</code>.
            Production must keep TLS on and provide <code className="font-mono">LAORVIA_SECURITY_KEK</code> and
            <code className="font-mono">LAORVIA_SECURITY_IP_PEPPER</code> from a secret manager.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <Server className="size-3.5 text-pine-600" aria-hidden /> Spring Boot 4.1.2 · Java 21 · Jackson 3
            </span>
            <span>·</span>
            <span>Redis: laorvia:* (AEAD-wrapped channel keys)</span>
            <span>·</span>
            <span>HTTPS required outside localhost</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RedisStatusBadge() {
  const { health } = useCatalog();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(getApiBaseUrl);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(url);
    setEditing(false);
    const ok = await loadCatalog();
    if (ok) await initAccount();
  };

  return (
    <div className="mt-4">
      <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-pine-200 bg-pine-50 px-3 py-1 text-xs font-semibold text-pine-800">
        <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
        <span>
          AES-256-GCM · Redis Live
          {health ? ` (${health.latencyMs}ms · ${health.counts.hotels ?? 0} stays)` : ""}
        </span>
        <button type="button" onClick={() => setEditing((v) => !v)} className="underline underline-offset-2 hover:text-ink">
          {editing ? "Close" : "API URL"}
        </button>
      </div>
      {editing && (
        <form onSubmit={save} className="mt-2 flex max-w-sm gap-2">
          <input
            className="field h-9 py-1 font-mono text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="API Base URL"
          />
          <button type="submit" className={btnClass("dark", "sm")}>
            Switch
          </button>
        </form>
      )}
    </div>
  );
}
