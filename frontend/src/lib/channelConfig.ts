/**
 * Runtime configuration for the encrypted API channel.
 * No secret ever lives in this file: session keys are derived per browser tab.
 */

const BASE_OVERRIDE_KEY = "laorvia:apiBase";
const SESSION_KEY = "laorvia:sessionToken";
const GUEST_KEY = "laorvia:guestToken";
const DEVICE_KEY = "laorvia:deviceId";
const OBFUSCATE_ROUTES_KEY = "laorvia:obfuscateRoutes";

const DEFAULT_API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:8080/api/v1";

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string | null) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* storage unavailable — credentials stay in memory for this page only */
  }
}

export function getApiBaseUrl(): string {
  const saved = safeGet(localStorage, BASE_OVERRIDE_KEY);
  return (saved && saved.trim() ? saved.trim() : DEFAULT_API_BASE).replace(/\/+$/, "");
}

export function setApiBaseUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, "");
  safeSet(localStorage, BASE_OVERRIDE_KEY, !clean || clean === DEFAULT_API_BASE ? null : clean);
}

/** TLS is non-negotiable: only localhost may run over plain HTTP during development. */
export function assertSecureBaseUrl(base: string) {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("The API base URL is not a valid absolute URL.");
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("HTTPS is required. Plain-HTTP API endpoints are only allowed on localhost during development.");
  }
}

/** Bearer token lives in sessionStorage, never localStorage, and is only sent inside the encrypted channel. */
export function getSessionToken(): string | null {
  return safeGet(sessionStorage, SESSION_KEY);
}

export function setSessionToken(token: string | null) {
  safeSet(sessionStorage, SESSION_KEY, token);
}

export function getGuestToken(): string {
  let token = safeGet(localStorage, GUEST_KEY);
  if (!token) {
    token = randomToken();
    safeSet(localStorage, GUEST_KEY, token);
  }
  return token;
}

/** Rotated after sign-in so a claimed guest identity cannot be re-used. */
export function rotateGuestToken() {
  safeSet(localStorage, GUEST_KEY, randomToken());
}

/** Anonymous, random device identifier used only for cryptographic channel binding. */
export function getDeviceId(): string {
  let id = safeGet(localStorage, DEVICE_KEY);
  if (!id) {
    id = randomToken();
    safeSet(localStorage, DEVICE_KEY, id);
  }
  return id;
}

/** Route obfuscation: encrypts the canonical route inside the envelope to resist network traffic analysis. */
export function isRouteObfuscationEnabled(): boolean {
  const saved = safeGet(localStorage, OBFUSCATE_ROUTES_KEY);
  return saved === "true";
}

export function setRouteObfuscation(enabled: boolean) {
  safeSet(localStorage, OBFUSCATE_ROUTES_KEY, enabled ? "true" : null);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
