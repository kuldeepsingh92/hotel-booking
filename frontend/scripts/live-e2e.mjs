#!/usr/bin/env node
/**
 * LIVE end-to-end test: the real frontend LAV1 crypto module
 *   ↔ the real Spring Boot 4.1.2 API ↔ the real Redis instance.
 * Assumes the API is running on 127.0.0.1:8080 with TLS disabled for localhost.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.LIVE_API_BASE || "http://127.0.0.1:8080/api/v1";
const bundlePath = path.join(os.tmpdir(), `laorvia-live-${Date.now()}.mjs`);

await esbuild.build({
  stdin: {
    contents: `
      export { secureRequest, resetSecureChannel } from ${JSON.stringify(path.join(root, "src/lib/secureChannel.ts"))};
      export { setSessionToken, setApiBaseUrl } from ${JSON.stringify(path.join(root, "src/lib/channelConfig.ts"))};
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", target: "node20",
  outfile: bundlePath, define: { "import.meta.env": "{}" }, logLevel: "silent",
});

const storage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const m = await import(`file://${bundlePath}?v=${Date.now()}`);
m.setApiBaseUrl(BASE);

const pass = [];
const ok = (msg) => { pass.push(msg); console.log("✓", msg); };
const expectCode = async (label, fn, code) => {
  try { await fn(); } catch (err) {
    if (err.code !== code) throw new Error(`${label}: expected ${code}, got ${err.code}: ${err.message}`);
    ok(`${label} → ${code}`);
    return;
  }
  throw new Error(`${label}: request unexpectedly succeeded`);
};
const isoOffset = (days) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* 1. Catalogue over the encrypted channel */
const boot = await m.secureRequest("GET", "/bootstrap");
if (boot.cities.length !== 6 || boot.hotels.length !== 36 || boot.blogs.length !== 6) throw new Error("bootstrap counts wrong");
ok(`Encrypted bootstrap from Redis: ${boot.cities.length} cities, ${boot.hotels.length} hotels, ${boot.blogs.length} guides`);

/* 1b. Encrypted QUERY parameters (search + editorial filters) */
const udaipur = await m.secureRequest("GET", "/hotels?dest=udaipur&sort=price-asc");
if (!Array.isArray(udaipur) || udaipur.length === 0) throw new Error("encrypted query search failed");
if (!udaipur.every((h) => h.cityId === "udaipur")) throw new Error("destination filter leaked wrong rows");
const sorted = udaipur.map((h) => h.price);
if (JSON.stringify(sorted) !== JSON.stringify([...sorted].sort((a, b) => a - b))) throw new Error("sort parameter ignored");
ok(`Encrypted query parameters honoured (${udaipur.length} Udaipur stays, price ascending)`);
const heritage = await m.secureRequest("GET", "/blogs?category=Heritage%20%26%20Culture");
if (!Array.isArray(heritage) || heritage.length < 2) throw new Error("encrypted blog filters failed");
if (!heritage.every((b) => b.category === "Heritage & Culture")) throw new Error("blog category filter leaked wrong rows");
const searched = await m.secureRequest("GET", "/blogs?q=udaipur");
if (!Array.isArray(searched) || searched.length === 0) throw new Error("encrypted blog search failed");
ok(`Encrypted editorial filters honoured (${heritage.length} Heritage guides; search finds ${searched.length})`);

/* 2. Coupon validation happens server-side */
const expired = await m.secureRequest("POST", "/coupons/evaluate", { code: "MONSOON24", roomTotal: 20000, nights: 3, checkIn: isoOffset(30), checkOut: isoOffset(33) });
if (expired.ok !== false) throw new Error("expired coupon accepted");
const valid = await m.secureRequest("POST", "/coupons/evaluate", { code: "NAMASTE15", roomTotal: 20000, nights: 3, checkIn: isoOffset(30), checkOut: isoOffset(33) });
if (!valid.ok || valid.discount <= 0) throw new Error("valid coupon rejected");
ok(`Coupons evaluated server-side (expired rejected, NAMASTE15 saves ₹${valid.discount})`);

/* 3. Demo login + customer/token channel binding */
const auth = await m.secureRequest("POST", "/auth/demo", {});
m.setSessionToken(auth.token);
m.resetSecureChannel();
const me = await m.secureRequest("GET", "/auth/me");
if (me.user.email !== "demo@laorvia.com") throw new Error("wrong customer");
ok("Channel now locked to customer + exact bearer token");

/* 4. Booking + idempotency */
const hotel = boot.hotels.find((h) => h.id === "the-mewar-lake-haveli") ?? boot.hotels[0];
const roomIndex = hotel.rooms.findIndex((r) => r.sleeps >= 2);
const room = hotel.rooms[roomIndex];
const rate = room.rates.find((r) => r.payAtProperty) ?? room.rates[0];
const payload = {
  hotelId: hotel.id, roomIndex, rateId: rate.id,
  checkIn: isoOffset(30), checkOut: isoOffset(32),
  adults: 2, children: 0, rooms: 1,
  firstName: "Aarav", lastName: "Sharma", email: "demo@laorvia.com", phone: "+91 98201 23456",
  arrival: "Afternoon, 2 – 5 pm", requests: ["Quiet Room"], notes: "Live security test",
  addonIds: [], couponCode: "NAMASTE15", payLater: !!rate.payAtProperty, paymentMethod: "UPI (live test)",
};
const idem = `live-${Date.now()}`;
const created = await m.secureRequest("POST", "/bookings", payload, { idempotencyKey: idem });
if (!/^LN-[A-Z2-9]{6}$/.test(created.ref)) throw new Error("bad reference");
const duplicate = await m.secureRequest("POST", "/bookings", payload, { idempotencyKey: idem });
if (duplicate.ref !== created.ref) throw new Error("idempotency failed: duplicate booking created");
ok(`Booking ${created.ref} persisted; duplicate idempotency key returned the same booking`);

const owned = await m.secureRequest("GET", `/bookings/${created.ref}`);
if (owned.ref !== created.ref) throw new Error("booking read failed");
ok("Ownership check allows the owner to read the booking");

/* 5. Payment idempotency */
if (rate.payAtProperty) {
  const payKey = `pay-${Date.now()}`;
  const paid = await m.secureRequest("POST", `/bookings/${created.ref}/pay`, { method: "UPI (live test)" }, { idempotencyKey: payKey });
  if (!paid.paidAmount || paid.paidAmount <= 0) throw new Error("balance not paid");
  const again = await m.secureRequest("POST", `/bookings/${created.ref}/pay`, { method: "UPI (live test)" }, { idempotencyKey: payKey });
  if (again.paidAmount !== 0) throw new Error("double charge possible");
  ok(`Balance paid once (₹${paid.paidAmount}); retried with the same key → no double charge`);
}

/* 6. Server-side capacity rule */
await expectCode("Over-capacity room rejected", () => m.secureRequest("POST", "/bookings", { ...payload, adults: 5, children: 0, couponCode: null }, { idempotencyKey: `cap-${Date.now()}` }), "REQUEST_REJECTED");
ok("Server rejects over-capacity / invalid booking attempts");

/* 7. Chat thread persisted in Redis */
const sent = await m.secureRequest("POST", `/bookings/${created.ref}/messages`, { text: "Could we have Jain breakfast and an early check-in?" });
if (!sent.messages.some((x) => x.from === "guest")) throw new Error("message not stored");
await new Promise((r) => setTimeout(r, 1800));
const thread = await m.secureRequest("GET", `/bookings/${created.ref}/messages`);
if (!thread.messages.some((x) => x.from === "property")) throw new Error("host reply missing");
ok("Chat thread persisted; front-desk reply written to Redis by the server");

/* 8. Second customer cannot use this encrypted channel */
const unique = Date.now();
const second = await m.secureRequest("POST", "/auth/signup", {
  firstName: "Security", lastName: "Probe", email: `probe-${unique}@example.com`,
  password: "Probe-Password-2026!", marketing: false,
});
m.setSessionToken(second.token);
await expectCode("Token swap on a bound channel", () => m.secureRequest("GET", "/auth/me"), "SECURITY_CHANNEL_BINDING_MISMATCH");

/* 9. Customer B on a fresh channel cannot read customer A's booking */
m.resetSecureChannel();
const meB = await m.secureRequest("GET", "/auth/me");
if (meB.user.email !== `probe-${unique}@example.com`) throw new Error("second user binding failed");
await expectCode("Cross-customer booking read", () => m.secureRequest("GET", `/bookings/${created.ref}`), "REQUEST_REJECTED");
ok("Cross-customer booking access rejected");

/* 10. Device binding */
globalThis.localStorage.setItem("laorvia:deviceId", "different-device-fingerprint");
await expectCode("Device change mid-session", () => m.secureRequest("GET", "/auth/me"), "SECURITY_DEVICE_MISMATCH");

/* 11. Anonymous downgrade on a bound channel */
m.resetSecureChannel();
m.setSessionToken(auth.token);
await m.secureRequest("GET", "/auth/me");
m.setSessionToken(null);
await expectCode("Dropping the token from a bound channel", () => m.secureRequest("GET", "/auth/me"), "SECURITY_CHANNEL_BINDING_MISMATCH");

fs.rmSync(bundlePath, { force: true });
console.log(`\nALL ${pass.length} LIVE SECURITY CHECKS PASSED against Spring Boot 4.1.2 + Redis`);
