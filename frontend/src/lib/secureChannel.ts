import { ApiRequestError } from "./errors";
import {
  assertSecureBaseUrl,
  getApiBaseUrl,
  getDeviceId,
  getGuestToken,
  getSessionToken,
  isRouteObfuscationEnabled,
} from "./channelConfig";

/**
 * LAORVIA SECURE CHANNEL (LAV1)
 *
 *   ECDH P-256  →  HKDF-SHA256  →  AES-256-GCM (request + response)
 *                              →  HMAC-SHA256 (request authentication)
 *
 * Every non-handshake API call carries:
 *   X-LAV-Key, X-LAV-TS, X-LAV-Nonce, X-LAV-Auth, X-LAV-Device
 * plus an encrypted query header and/or encrypted JSON envelope body.
 *
 * Security properties:
 *  - Per-tab ephemeral key pair. The server discards its ECDH private key after
 *    the handshake, so recorded traffic cannot be decrypted later (forward secrecy).
 *  - Distinct request / response / authentication keys derived with HKDF.
 *  - AES-256-GCM with an AAD binding the key id, timestamp and nonce (requests)
 *    or the request nonce and status (responses).
 *  - Single-use nonces and a ±60s timestamp window make replay impossible.
 *  - The server locks the channel to this device, user-agent, IP and — once
 *    signed in — exactly one customer ID and bearer token.
 *
 * Honest limitation: a browser must be able to decrypt its own session. This is
 * strong anti-scraping and anti-tamper defence-in-depth ON TOP OF TLS, not a
 * substitute for it, and cannot make a determined attacker who reverse-engineers
 * the app unable to read the data they are authorised to fetch.
 */

const HANDSHAKE_PATH = "/security/handshake";
const CLOCK_SKEW_MS = 50_000;

interface Channel {
  baseUrl: string;
  keyId: string;
  requestKey: CryptoKey;
  responseKey: CryptoKey;
  authKey: CryptoKey;
  expiresAt: number;
}

interface Envelope {
  v: number;
  iv: string;
  ct: string;
}

let channel: Channel | null = null;
let pending: Promise<Channel> | null = null;

export function resetSecureChannel() {
  channel = null;
  pending = null;
}

export async function ensureSecureChannel(baseUrl = getApiBaseUrl()): Promise<Channel> {
  if (channel && channel.baseUrl === baseUrl && channel.expiresAt > Date.now() + CLOCK_SKEW_MS) {
    return channel;
  }
  if (!pending) {
    pending = handshake(baseUrl).finally(() => {
      pending = null;
    });
  }
  return pending;
}

/* ───────────────────────── handshake ───────────────────────── */

async function handshake(baseUrl: string): Promise<Channel> {
  if (!globalThis.crypto?.subtle) {
    throw new ApiRequestError(
      0,
      "SECURITY_CONTEXT_REQUIRED",
      "This browser cannot open the encrypted channel because Web Crypto is unavailable. Serve Laorvia over HTTPS.",
    );
  }
  try {
    assertSecureBaseUrl(baseUrl);
  } catch (err) {
    throw new ApiRequestError(0, "SECURITY_INSECURE_ORIGIN", err instanceof Error ? err.message : "HTTPS required.");
  }

  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const clientPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const clientNonce = b64url(crypto.getRandomValues(new Uint8Array(32)));

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${HANDSHAKE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        clientPublicKey: b64url(clientPublicKey),
        clientNonce,
        deviceId: getDeviceId(),
        guestToken: getGuestToken(),
        appVersion: "web-1.0.0",
      }),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK_ERROR",
      `Cannot reach the Laorvia secure API at ${baseUrl}. Start the Spring Boot 4.1.2 service and populate Redis.`,
    );
  }

  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      String(payload.error ?? "SECURITY_HANDSHAKE_FAILED"),
      String(payload.message ?? "The secure channel could not be established."),
    );
  }

  const serverPublicKey = fromB64url(String(payload.serverPublicKey ?? ""));
  const serverNonce = String(payload.serverNonce ?? "");
  const keyId = String(payload.keyId ?? "");
  if (serverPublicKey.length !== 65 || serverPublicKey[0] !== 4 || !serverNonce || !keyId) {
    throw new ApiRequestError(0, "SECURITY_HANDSHAKE_FAILED", "The server returned an invalid handshake.");
  }

  const serverKey = await crypto.subtle.importKey(
    "raw",
    asBuffer(serverPublicKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, keyPair.privateKey, 256));

  const serverNonceBytes = fromB64url(serverNonce);
  const salt = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      asBuffer(
        concat(
          utf8("LAV1-SALT:"),
          fromB64url(clientNonce),
          serverNonceBytes,
          clientPublicKey,
          serverPublicKey,
        ),
      ),
    ),
  );

  const requestKeyBytes = await hkdf(shared, salt, "LAV1-REQ");
  const responseKeyBytes = await hkdf(shared, salt, "LAV1-RES");
  const authKeyBytes = await hkdf(shared, salt, "LAV1-AUTH");

  const authKey = await importHmacKey(authKeyBytes);
  const expected = b64url(await hmac(authKey, utf8(`LAV1-CONFIRM\n${clientNonce}\n${serverNonce}\n${keyId}`)));
  if (!constantTimeEqual(expected, String(payload.confirmation ?? ""))) {
    throw new ApiRequestError(0, "SECURITY_HANDSHAKE_UNVERIFIED", "Key confirmation failed. The channel was not trusted.");
  }

  channel = {
    baseUrl,
    keyId,
    requestKey: await importAesKey(requestKeyBytes, ["encrypt"]),
    responseKey: await importAesKey(responseKeyBytes, ["decrypt"]),
    authKey,
    expiresAt: Date.now() + Number(payload.expiresInSeconds ?? 1800) * 1000,
  };
  return channel;
}

/* ───────────────────────── encrypted request ───────────────────────── */

export async function secureRequest<T>(
  method: string,
  pathWithQuery: string,
  body?: unknown,
  options?: { baseUrl?: string; idempotencyKey?: string; retry?: boolean; obfuscate?: boolean },
): Promise<T> {
  const baseUrl = (options?.baseUrl ?? getApiBaseUrl()).replace(/\/+$/, "");
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const ch = await ensureSecureChannel(baseUrl);
    const [pathOnly, rawQuery] = splitPath(pathWithQuery);
    const canonicalPath = new URL(`${baseUrl}${pathOnly}`).pathname;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const aad = utf8(`LAV1-AAD\n${ch.keyId}\n${timestamp}\n${nonce}`);

    const shouldObfuscate = options?.obfuscate ?? isRouteObfuscationEnabled();
    const requestUrl = shouldObfuscate ? `${baseUrl}/dispatch` : `${baseUrl}${pathOnly}`;
    const signPath = new URL(requestUrl).pathname;

    const bodyEnvelope = body !== undefined ? await seal(ch.requestKey, utf8(JSON.stringify(body)), aad) : "";
    const queryEnvelope = rawQuery ? await seal(ch.requestKey, utf8(rawQuery), aad) : "";
    const targetEnvelope = shouldObfuscate ? await seal(ch.requestKey, utf8(canonicalPath), aad) : "";

    const bodyHash = b64url(await sha256(bodyEnvelope ? utf8(bodyEnvelope) : new Uint8Array()));
    const queryHash = b64url(await sha256(queryEnvelope ? utf8(queryEnvelope) : new Uint8Array()));
    const targetHash = targetEnvelope ? b64url(await sha256(utf8(targetEnvelope))) : "";
    const canonical = `LAV1-SIG\n${method.toUpperCase()}\n${signPath}\n${ch.keyId}\n${timestamp}\n${nonce}\n${bodyHash}\n${queryHash}${targetHash ? `\n${targetHash}` : ""}`;
    const signature = b64url(await hmac(ch.authKey, utf8(canonical)));

    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-LAV-Key": ch.keyId,
      "X-LAV-TS": timestamp,
      "X-LAV-Nonce": nonce,
      "X-LAV-Auth": signature,
      "X-LAV-Device": getDeviceId(),
    };
    if (queryEnvelope) headers["X-LAV-Query"] = queryEnvelope;
    if (targetEnvelope) headers["X-LAV-Target"] = targetEnvelope;
    if (bodyEnvelope) headers["Content-Type"] = "application/json";
    const sessionToken = getSessionToken();
    if (sessionToken) headers["X-Session-Token"] = sessionToken;
    if (options?.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: method.toUpperCase(),
        headers,
        body: bodyEnvelope || undefined,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
    } catch {
      throw new ApiRequestError(0, "NETWORK_ERROR", "Network request failed. Check your connection and retry.");
    }

    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    // Minimal plaintext errors are only emitted when the channel itself is invalid.
    const securityCode = parsed && typeof parsed.error === "string" && parsed.error.startsWith("SECURITY_")
      ? parsed.error
      : null;
    if (securityCode) {
      lastError = new ApiRequestError(
        response.status,
        securityCode,
        String(parsed?.message ?? "Security check failed."),
      );
      const recoverable = ["SECURITY_KEY_UNKNOWN", "SECURITY_KEY_EXPIRED", "SECURITY_REPLAY_DETECTED"].includes(securityCode);
      if (recoverable && attempt === 0) {
        resetSecureChannel();
        continue;
      }
      throw lastError;
    }

    if (!parsed || parsed.v !== 1 || typeof parsed.iv !== "string" || typeof parsed.ct !== "string") {
      throw new ApiRequestError(response.status || 0, "SECURITY_BAD_RESPONSE", "The server response was not a valid encrypted envelope.");
    }

    const plaintext = await open(
      ch.responseKey,
      parsed as unknown as Envelope,
      utf8(`LAV1-RES\n${ch.keyId}\n${nonce}\n${response.status}`),
    );
    const data = JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;

    if (!response.ok) {
      throw new ApiRequestError(
        response.status,
        String(data.error ?? "API_ERROR"),
        String(data.message ?? "Request could not be completed."),
      );
    }
    return data as T;
  }

  throw lastError instanceof Error
    ? lastError
    : new ApiRequestError(0, "SECURITY_CHANNEL_FAILED", "The encrypted channel could not be established.");
}

/* ───────────────────────── crypto helpers ───────────────────────── */

async function seal(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBuffer(iv), tagLength: 128, additionalData: asBuffer(aad) }, key, asBuffer(plaintext)),
  );
  const envelope: Envelope = { v: 1, iv: b64url(iv), ct: b64url(ct) };
  return JSON.stringify(envelope);
}

async function open(key: CryptoKey, envelope: Envelope, aad: Uint8Array): Promise<Uint8Array> {
  try {
    const iv = fromB64url(envelope.iv);
    const ct = fromB64url(envelope.ct);
    if (iv.length !== 12 || ct.length < 17) throw new Error("bad envelope");
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: asBuffer(iv), tagLength: 128, additionalData: asBuffer(aad) }, key, asBuffer(ct)),
    );
  } catch {
    throw new ApiRequestError(0, "SECURITY_DECRYPT_FAILED", "The encrypted response could not be verified.");
  }
}

async function hkdf(shared: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", asBuffer(shared), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: asBuffer(salt), info: asBuffer(utf8(info)) },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

function importAesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", asBuffer(raw), { name: "AES-GCM", length: 256 }, false, usages);
}

function importHmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", asBuffer(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function hmac(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, asBuffer(data)));
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", asBuffer(data)));
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return new Uint8Array();
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function splitPath(pathWithQuery: string): [string, string] {
  const index = pathWithQuery.indexOf("?");
  if (index === -1) return [pathWithQuery, ""];
  return [pathWithQuery.slice(0, index), pathWithQuery.slice(index + 1)];
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
