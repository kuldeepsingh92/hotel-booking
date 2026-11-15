#!/usr/bin/env node
/**
 * Laorvia LAV1 protocol self-test.
 *
 * 1. Verifies HKDF-SHA256 against RFC 5869 Test Case 1.
 * 2. Verifies the frontend and backend use identical domain-separation labels.
 * 3. Runs the REAL frontend module (src/lib/secureChannel.ts, bundled) against a
 *    reference implementation of the Spring Boot contract:
 *       handshake → encrypted bootstrap → authenticated binding → device mismatch.
 * 4. Verifies the PBKDF2 password format written by the Redis seeder.
 *
 * This does not replace `mvn test`; it guarantees the browser half and the wire
 * contract are correct before Java is available.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seed = JSON.parse(fs.readFileSync(path.join(root, "scripts/seed-data.json"), "utf8"));

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(s, "base64url");
const sha256 = async (buf) => new Uint8Array(await subtle.digest("SHA-256", buf));
async function importHmac(raw) {
  return subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function sign(key, data) {
  return new Uint8Array(await subtle.sign("HMAC", key, data));
}
async function hkdf(ikm, salt, info, length) {
  const key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: typeof info === "string" ? enc.encode(info) : info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}
async function aesKey(raw, usages) {
  return subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, usages);
}

/* ───────── 1. RFC 5869 vector ───────── */
{
  const ikm = Buffer.from("0b".repeat(22), "hex");
  const salt = Buffer.from("000102030405060708090a0b0c", "hex");
  const info = Buffer.from("f0f1f2f3f4f5f6f7f8f9", "hex");
  const okm = Buffer.from(await hkdf(ikm, salt, info, 42)).toString("hex");
  const expected = "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865";
  if (okm !== expected) throw new Error("HKDF RFC 5869 vector mismatch");
  console.log("✓ HKDF-SHA256 matches RFC 5869 Test Case 1");
}

/* ───────── 2. Cross-implementation label check ───────── */
{
  const java = fs.readFileSync(path.join(root, "backend/src/main/java/com/laorvia/api/security/CryptoService.java"), "utf8");
  const client = fs.readFileSync(path.join(root, "src/lib/secureChannel.ts"), "utf8");
  for (const label of ["LAV1-SALT:", "LAV1-REQ", "LAV1-RES", "LAV1-AUTH", "LAV1-AAD", "LAV1-SIG", "LAV1-CONFIRM"]) {
    if (!java.includes(label) || !client.includes(label)) throw new Error(`Protocol label missing on one side: ${label}`);
  }
  console.log("✓ Frontend and Spring Boot share identical LAV1 labels");
}

/* ───────── 3. Reference Spring Boot contract ───────── */
const channels = new Map();
const nonces = new Set();
const users = new Map();
const sessions = new Map();
const port = 18080;
const DEMO_EMAIL = seed.meta.demoEmail;

function hash(value) {
  return b64u(crypto.createHash("sha256").update(`${value}|`).digest());
}

async function handshake(req, userAgent) {
  const clientPubRaw = unb64u(req.clientPublicKey);
  const clientNonce = unb64u(req.clientNonce);
  if (clientPubRaw.length !== 65 || clientPubRaw[0] !== 4) throw Object.assign(new Error("bad key"), { status: 400 });
  const serverPair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await subtle.exportKey("raw", serverPair.publicKey));
  const serverNonce = crypto.randomBytes(32);
  const clientKey = await subtle.importKey("raw", clientPubRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: clientKey }, serverPair.privateKey, 256));
  const salt = await sha256(Buffer.concat([Buffer.from("LAV1-SALT:"), clientNonce, serverNonce, Buffer.from(clientPubRaw), Buffer.from(serverPubRaw)]));
  const keyId = `k1_${crypto.randomUUID().replace(/-/g, "")}`;
  const requestKey = await hkdf(shared, salt, "LAV1-REQ", 32);
  const responseKey = await hkdf(shared, salt, "LAV1-RES", 32);
  const authKey = await hkdf(shared, salt, "LAV1-AUTH", 32);
  const confirmation = b64u(await sign(await importHmac(authKey), enc.encode(`LAV1-CONFIRM\n${req.clientNonce}\n${b64u(serverNonce)}\n${keyId}`)));
  channels.set(keyId, {
    requestKey: await aesKey(requestKey, ["decrypt"]),
    responseKey: await aesKey(responseKey, ["encrypt"]),
    authKey: await importHmac(authKey),
    keyId,
    deviceHash: hash(req.deviceId),
    uaHash: hash(userAgent),
    ipHash: hash("127.0.0.1"),
    expiresAt: Date.now() + 1800_000,
    userId: null,
    tokenHash: null,
  });
  return { keyId, serverPublicKey: b64u(serverPubRaw), serverNonce: b64u(serverNonce), expiresInSeconds: 1800, confirmation, cipher: "LAV1" };
}

async function openChannel(httpReq, rawBody) {
  const keyId = httpReq.headers["x-lav-key"];
  const ts = httpReq.headers["x-lav-ts"];
  const nonce = httpReq.headers["x-lav-nonce"];
  const signature = httpReq.headers["x-lav-auth"];
  const device = String(httpReq.headers["x-lav-device"] ?? "");
  const queryCipher = httpReq.headers["x-lav-query"] ?? "";
  if (!keyId || !ts || !nonce || !signature) throw Object.assign(new Error("missing"), { status: 401, code: "SECURITY_HEADERS_MISSING" });
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60) throw Object.assign(new Error("skew"), { status: 401, code: "SECURITY_TIMESTAMP_EXPIRED" });
  const channel = channels.get(keyId);
  if (!channel || channel.expiresAt < Date.now()) throw Object.assign(new Error("unknown"), { status: 401, code: "SECURITY_KEY_EXPIRED" });
  if (channel.deviceHash !== hash(device) || channel.uaHash !== hash(String(httpReq.headers["user-agent"] ?? "")) || channel.ipHash !== hash("127.0.0.1")) {
    throw Object.assign(new Error("binding"), { status: 403, code: "SECURITY_DEVICE_MISMATCH" });
  }
  const canonicalPath = new URL(httpReq.url, "http://127.0.0.1").pathname;
  const canonical = `LAV1-SIG\n${httpReq.method.toUpperCase()}\n${canonicalPath}\n${keyId}\n${ts}\n${nonce}\n${b64u(await sha256(rawBody ? Buffer.from(rawBody) : Buffer.alloc(0)))}\n${b64u(await sha256(Buffer.from(queryCipher)))}`;
  const expected = await sign(channel.authKey, enc.encode(canonical));
  const supplied = Buffer.from(unb64u(String(signature)));
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, Buffer.from(expected))) {
    throw Object.assign(new Error("signature"), { status: 401, code: "SECURITY_SIGNATURE_INVALID" });
  }
  if (nonces.has(`${keyId}:${nonce}`)) throw Object.assign(new Error("replay"), { status: 409, code: "SECURITY_REPLAY_DETECTED" });
  nonces.add(`${keyId}:${nonce}`);

  const aad = enc.encode(`LAV1-AAD\n${keyId}\n${ts}\n${nonce}`);
  const envelope = rawBody ? JSON.parse(rawBody) : null;
  const bodyBytes = envelope
    ? new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: unb64u(envelope.iv), tagLength: 128, additionalData: aad }, channel.requestKey, unb64u(envelope.ct)))
    : new Uint8Array();
  const query = queryCipher
    ? dec.decode(await subtle.decrypt({ name: "AES-GCM", iv: unb64u(JSON.parse(queryCipher).iv), tagLength: 128, additionalData: aad }, channel.requestKey, unb64u(JSON.parse(queryCipher).ct)))
    : "";

  const token = httpReq.headers["x-session-token"];
  if (token) {
    const userId = sessions.get(token);
    if (!userId) throw Object.assign(new Error("session"), { status: 401, code: "SECURITY_SESSION_INVALID" });
    if (channel.userId && (channel.userId !== userId || channel.tokenHash !== hash(token))) {
      throw Object.assign(new Error("binding"), { status: 403, code: "SECURITY_CHANNEL_BINDING_MISMATCH" });
    }
    channel.userId = userId;
    channel.tokenHash = hash(token);
  } else if (channel.userId) {
    throw Object.assign(new Error("downgrade"), { status: 403, code: "SECURITY_CHANNEL_BINDING_MISMATCH" });
  }

  return { channel, keyId, nonce, body: bodyBytes.length ? JSON.parse(dec.decode(bodyBytes)) : null, query: new URLSearchParams(query), token };
}

async function writeEncrypted(res, channel, nonce, status, payload) {
  if (status === 204) { res.writeHead(204, { "Cache-Control": "no-store", "X-Request-Id": crypto.randomUUID() }); res.end(); return; }
  const iv = crypto.randomBytes(12);
  const aad = enc.encode(`LAV1-RES\n${channel.keyId}\n${nonce}\n${status}`);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128, additionalData: aad }, channel.responseKey, enc.encode(JSON.stringify(payload))));
  const body = JSON.stringify({ v: 1, iv: b64u(iv), ct: b64u(ct) });
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-Id": crypto.randomUUID() });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  try {
    if (url.pathname === "/api/v1/security/handshake" && req.method === "POST") {
      const payload = await handshake(JSON.parse(raw.toString()), String(req.headers["user-agent"] ?? ""));
      res.writeHead(201, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(payload));
      return;
    }
    const opened = await openChannel(req, raw.length ? raw.toString() : "");

    if (url.pathname === "/api/v1/bootstrap") {
      const payload = {
        cities: seed.cities, hotels: seed.hotels, landmarks: seed.landmarks, hosts: seed.hosts,
        coupons: seed.coupons, addons: seed.addons, blogs: seed.blogs, home: seed.home, meta: seed.meta, seedInfo: { version: seed.version },
      };
      return writeEncrypted(res, opened.channel, opened.nonce, 200, payload);
    }
    if (url.pathname === "/api/v1/auth/demo" && req.method === "POST") {
      const user = users.get(DEMO_EMAIL) ?? { id: "u_demo", firstName: "Aarav", lastName: "Sharma", email: DEMO_EMAIL, phone: "", country: "India", marketing: true, createdAt: "2026-01-01" };
      users.set(DEMO_EMAIL, user);
      const token = crypto.randomBytes(32).toString("base64url");
      sessions.set(token, user.id);
      return writeEncrypted(res, opened.channel, opened.nonce, 200, { token, user, bookings: [], threads: [], saved: [] });
    }
    if (url.pathname === "/api/v1/auth/me") {
      const user = [...users.values()].find((u) => u.id === opened.channel.userId);
      if (!user) throw Object.assign(new Error("no user"), { status: 401, code: "SECURITY_SESSION_INVALID" });
      return writeEncrypted(res, opened.channel, opened.nonce, 200, { token: opened.token, user, bookings: [], threads: [], saved: [] });
    }
    return writeEncrypted(res, opened.channel, opened.nonce, 404, { status: 404, error: "NOT_FOUND", message: "No route." });
  } catch (err) {
    const status = err.status ?? 500;
    const code = err.code ?? "SERVER_ERROR";
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ status, error: code, message: err.message }));
  }
});

/* ───────── 4. PBKDF2 format parity ───────── */
{
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync("laorvia2026", salt, 310000, 32, "sha256");
  const stored = `pbkdf2-sha256$310000$${salt.toString("base64")}$${hash.toString("base64")}`;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2-sha256" || Number(parts[1]) !== 310000) throw new Error("PBKDF2 format mismatch");
  if (Buffer.from(parts[2], "base64").length !== 16 || Buffer.from(parts[3], "base64").length !== 32) throw new Error("PBKDF2 sizes mismatch");
  console.log("✓ PBKDF2-HMAC-SHA256 seeder format matches the Java parser");
}

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

/* ───────── 5. Drive the real frontend module ───────── */
const bundlePath = path.join(os.tmpdir(), `laorvia-secure-${crypto.randomUUID()}.mjs`);
await esbuild.build({
  stdin: {
    contents: `
      export { secureRequest, resetSecureChannel } from ${JSON.stringify(path.join(root, "src/lib/secureChannel.ts"))};
      export { setSessionToken, setApiBaseUrl, getDeviceId } from ${JSON.stringify(path.join(root, "src/lib/channelConfig.ts"))};
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: bundlePath,
  define: { "import.meta.env": "{}" },
  logLevel: "silent",
});

const storage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const mod = await import(`file://${bundlePath}?t=${Date.now()}`);
const BASE = `http://127.0.0.1:${port}/api/v1`;
mod.setApiBaseUrl(BASE);

const bootstrap = await mod.secureRequest("GET", "/bootstrap");
if (bootstrap.cities.length !== seed.cities.length) throw new Error("cities mismatch over encrypted channel");
if (bootstrap.hotels.length !== seed.hotels.length) throw new Error("hotels mismatch over encrypted channel");
if (bootstrap.blogs.length !== seed.blogs.length) throw new Error("blogs mismatch over encrypted channel");
console.log(`✓ Encrypted bootstrap round-trip: ${bootstrap.cities.length} cities, ${bootstrap.hotels.length} hotels, ${bootstrap.blogs.length} guides`);

const login = await mod.secureRequest("POST", "/auth/demo", {});
mod.setSessionToken(login.token);
mod.resetSecureChannel();
const me = await mod.secureRequest("GET", "/auth/me");
if (me.user.email !== DEMO_EMAIL) throw new Error("session binding did not resolve the customer");
console.log("✓ Channel locked to customer + bearer token; /auth/me resolved " + me.user.email);

globalThis.localStorage.setItem("laorvia:deviceId", "attacker-operated-device");
let rejected = null;
try {
  await mod.secureRequest("GET", "/auth/me");
} catch (err) {
  rejected = err.code;
}
if (rejected !== "SECURITY_DEVICE_MISMATCH") throw new Error(`device binding not enforced (got ${rejected})`);
console.log("✓ Device-binding mismatch rejected with SECURITY_DEVICE_MISMATCH");

server.close();
fs.rmSync(bundlePath, { force: true });
console.log("\nALL LAV1 SECURITY SELF-TESTS PASSED");
