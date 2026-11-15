#!/usr/bin/env node
/**
 * Laorvia Redis Seeder — Populates Redis with ALL catalog, editorial, pricing,
 * metadata, and demo account data consumed by the Spring Boot 4.1.2 API.
 *
 * Zero external npm dependencies (uses Node.js built-in `net` + `crypto` modules).
 *
 * Usage:
 *   node scripts/seed-redis.mjs
 *   REDIS_HOST=127.0.0.1 REDIS_PORT=6379 REDIS_PASSWORD="" REDIS_DB=0 node scripts/seed-redis.mjs
 *   node scripts/seed-redis.mjs --flush       # clears existing laorvia:* keys first
 *   node scripts/seed-redis.mjs --emit-resp   # prints raw RESP commands for `redis-cli --pipe`
 */

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "seed-data.json");

const HOST = process.env.REDIS_HOST || "127.0.0.1";
const PORT = Number(process.env.REDIS_PORT || 6379);
const PASSWORD = process.env.REDIS_PASSWORD || "";
const DB = Number(process.env.REDIS_DB || 0);
const FLUSH = process.argv.includes("--flush");
const EMIT_RESP = process.argv.includes("--emit-resp");

/**
 * Must match AuthService.hashPassword in backend/src/main/java/com/laorvia/api/service/AuthService.java
 * PBKDF2-HMAC-SHA256, 310k iterations, 128-bit per-user salt.
 */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(plain, salt, 310000, 32, "sha256");
  return `pbkdf2-sha256$310000$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function isoDateOffset(days) {
  const d = new Date();
  const shifted = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

function freeCancelUntil(checkIn) {
  const [y, m, day] = checkIn.split("-").map(Number);
  const d = new Date(y, m - 1, day - 2);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const effective = d < today ? today : d;
  const pad = (n) => String(n).padStart(2, "0");
  return `${effective.getFullYear()}-${pad(effective.getMonth() + 1)}-${pad(effective.getDate())}`;
}

function taxPortion(gross) {
  return Math.round((gross * 0.12) / 1.12);
}

/** Build the demo account, 5 sample Indian bookings, and initial property chat threads */
function buildDemoAccount(data) {
  const userId = "u_demo_aarav";
  const email = data.meta.demoEmail || "demo@laorvia.com";
  const password = "laorvia2026"; // dev-only seed credential; the demo endpoint never exposes it
  const todayIso = isoDateOffset(0);

  const user = {
    id: userId,
    firstName: "Aarav",
    lastName: "Sharma",
    email,
    passwordHash: hashPassword(password),
    phone: "+91 98201 23456",
    country: "India",
    marketing: true,
    createdAt: todayIso,
  };

  const hotelMap = new Map(data.hotels.map((h) => [h.id, h]));
  const addonMap = new Map(data.addons.map((a) => [a.id, a]));
  const bookings = [];
  const threads = [];

  function calcAddon(id, nights, guests) {
    const a = addonMap.get(id);
    if (!a) return 0;
    if (a.billing === "PER_GUEST_PER_NIGHT") return a.price * nights * guests;
    return a.price;
  }

  function addSample(opts) {
    const hotel = hotelMap.get(opts.hotelId);
    if (!hotel) return;
    const room = hotel.rooms[opts.roomIndex] || hotel.rooms[0];
    const rate = room.rates.find((r) => r.id === opts.rateId) || room.rates[0];
    const checkIn = isoDateOffset(opts.inOffset);
    const checkOut = isoDateOffset(opts.inOffset + opts.nights);
    const guests = (opts.adults || 2) + (opts.children || 0);
    const roomTotal = rate.price * opts.nights;
    const addons = (opts.addonIds || []).map((id) => ({
      id,
      title: addonMap.get(id).title,
      amount: calcAddon(id, opts.nights, guests),
    }));
    const addonsTotal = addons.reduce((s, a) => s + a.amount, 0);
    const discount = opts.discount || 0;
    const total = roomTotal + addonsTotal - discount;
    const createdAt = new Date(Date.now() - Math.max(2, Math.abs(opts.inOffset) + 12) * 86_400_000).toISOString();
    const paidAmount = opts.paid ? total : 0;

    bookings.push({
      ref: opts.ref,
      userId,
      hotelId: hotel.id,
      roomIndex: opts.roomIndex,
      roomName: room.name,
      rateId: rate.id,
      rateName: rate.name,
      checkIn,
      checkOut,
      nights: opts.nights,
      adults: opts.adults || 2,
      children: opts.children || 0,
      rooms: 1,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      arrival: opts.arrival,
      requests: opts.requests || [],
      notes: opts.notes || "",
      addons,
      roomTotal,
      addonsTotal,
      coupon: opts.coupon || null,
      discount,
      total,
      taxes: taxPortion(total),
      payments:
        paidAmount > 0
          ? [{ id: `p_${opts.ref}`, amount: paidAmount, method: opts.method, at: createdAt, kind: "payment" }]
          : [],
      paymentMethod: opts.paid ? opts.method : "Pay at the property",
      refundable: rate.refundable,
      freeCancelUntil: rate.refundable ? freeCancelUntil(checkIn) : null,
      cancelledAt: null,
      refundAmount: 0,
      review: opts.review || null,
      createdAt,
      sample: true,
    });

    if (opts.message) {
      threads.push({
        ref: opts.ref,
        messages: [
          {
            id: `m_${opts.ref}_1`,
            from: "property",
            text: opts.message.text,
            at: createdAt,
            read: !opts.message.unread,
          },
        ],
      });
    }
  }

  // 1. Upcoming stay in Udaipur (Paid in full)
  addSample({
    ref: "LN-UDR842",
    hotelId: "the-mewar-lake-haveli",
    roomIndex: 1,
    rateId: "fx",
    inOffset: 24,
    nights: 3,
    addonIds: ["breakfast"],
    coupon: "NAMASTE15",
    discount: 2500,
    paid: true,
    method: "UPI (Google Pay)",
    arrival: "Afternoon, 2 – 5 pm",
    requests: ["High Floor with View", "Early Check-in (Morning Train/Flight)"],
    notes: "Celebrating our 5th wedding anniversary — a room with a direct view of Lake Pichola would make it unforgettable.",
    message: {
      text: "Namaste Aarav ji — we are honored to welcome you to Udaipur. We have blocked an upper-level Jharokha suite facing Lake Pichola and will arrange a private anniversary welcome on arrival.",
      unread: false,
    },
  });

  // 2. Upcoming stay with balance due at property (for online balance payment flow)
  addSample({
    ref: "LN-UDR915",
    hotelId: "fateh-sagar-palace-spa",
    roomIndex: 1,
    rateId: "fx",
    inOffset: 12,
    nights: 3,
    adults: 2,
    children: 1,
    addonIds: ["transfer"],
    paid: false,
    method: "Pay at the property",
    arrival: "Evening, 6 – 10 pm",
    requests: ["Pure Veg / Jain Food", "High Floor with View"],
    notes: "Travelling with our young daughter. Pure vegetarian food preferred.",
    message: {
      text: "Namaste Aarav ji — we have noted your pure vegetarian dietary preference and high-floor room request. Looking forward to hosting you!",
      unread: true,
    },
  });

  // 3. Completed stay in Goa (already reviewed)
  addSample({
    ref: "LN-GOA407",
    hotelId: "casa-da-silva-heritage-villa",
    roomIndex: 1,
    rateId: "nr",
    inOffset: -48,
    nights: 4,
    paid: true,
    method: "UPI (PhonePe)",
    arrival: "Afternoon, 2 – 5 pm",
    requests: ["Quiet Room"],
    notes: "",
    review: {
      score: 10,
      scores: { Cleanliness: 10, Location: 10, Hospitality: 10, Comfort: 9, "Value for Money": 10 },
      title: "The best private villa stay we have had in Goa",
      text: "The restored Portuguese architecture with oyster shell windows and private plunge pool was magical. Having chef-cooked Goan curry and breakfast in the quiet garden made us never want to leave.",
      at: new Date(Date.now() - 42 * 86_400_000).toISOString(),
    },
  });

  // 4. Completed stay in Manali (ready to review)
  addSample({
    ref: "LN-MNL319",
    hotelId: "solang-valley-cedar-chalet",
    roomIndex: 0,
    rateId: "fx",
    inOffset: -22,
    nights: 3,
    paid: true,
    method: "RuPay Debit Card ending 4821",
    arrival: "Evening, 6 – 10 pm",
    requests: ["Late Check-out"],
    notes: "Fireplace ready on arrival was much appreciated in the snow.",
    message: {
      text: "Namaste Aarav ji — thank you for staying with us in Solang Valley. We hope your journey back was comfortable. Please write a review whenever you get a moment!",
      unread: false,
    },
  });

  // 5. Completed stay in Varanasi (ready to review)
  addSample({
    ref: "LN-VNS602",
    hotelId: "brijrama-heritage-palace",
    roomIndex: 1,
    rateId: "nr",
    inOffset: -90,
    nights: 2,
    paid: true,
    method: "UPI (Paytm)",
    arrival: "Morning boat arrival",
    requests: ["Pure Veg / Jain Food", "Temple / Sightseeing Cab Assistance"],
    notes: "Ganga aarti view from the terrace was surreal.",
  });

  return { user, bookings, threads };
}

/** Encode a single Redis command as RESP2 wire format */
function encodeResp(args) {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const str = String(arg);
    const bytes = Buffer.byteLength(str, "utf8");
    out += `$${bytes}\r\n${str}\r\n`;
  }
  return out;
}

/** Build the complete list of Redis commands to populate all Laorvia keys */
function buildCommands(data) {
  const cmds = [];

  if (PASSWORD) cmds.push(["AUTH", PASSWORD]);
  if (DB > 0) cmds.push(["SELECT", String(DB)]);
  if (FLUSH) cmds.push(["FLUSHDB"]);

  // Reset ordered lists and indexes so re-seeding is idempotent
  cmds.push([
    "DEL",
    "laorvia:hotels:order",
    "laorvia:blogs:order",
    ...data.cities.map((c) => `laorvia:hotels:byCity:${c.id}`),
  ]);

  // 1. Cities
  cmds.push(["SET", "laorvia:cities", JSON.stringify(data.cities)]);
  for (const c of data.cities) {
    cmds.push(["SET", `laorvia:city:${c.id}`, JSON.stringify(c)]);
  }

  // 2. Hotels (Hash + order list + per-city index sets)
  for (const h of data.hotels) {
    cmds.push(["HSET", "laorvia:hotels", h.id, JSON.stringify(h)]);
    cmds.push(["RPUSH", "laorvia:hotels:order", h.id]);
    cmds.push(["SADD", `laorvia:hotels:byCity:${h.cityId}`, h.id]);
  }

  // 3. Landmarks & Property Hosts
  for (const [cityId, list] of Object.entries(data.landmarks)) {
    cmds.push(["SET", `laorvia:landmarks:${cityId}`, JSON.stringify(list)]);
  }
  for (const [cityId, host] of Object.entries(data.hosts)) {
    cmds.push(["HSET", "laorvia:hosts", cityId, JSON.stringify(host)]);
  }

  // 4. Coupons & Add-ons
  for (const c of data.coupons) {
    cmds.push(["HSET", "laorvia:coupons", c.code, JSON.stringify(c)]);
  }
  for (const a of data.addons) {
    cmds.push(["HSET", "laorvia:addons", a.id, JSON.stringify(a)]);
  }

  // 5. Editorial Blogs (Hash + order list)
  for (const b of data.blogs) {
    cmds.push(["HSET", "laorvia:blogs", b.slug, JSON.stringify(b)]);
    cmds.push(["RPUSH", "laorvia:blogs:order", b.slug]);
  }

  // 6. Homepage dynamic blocks & Portal Metadata
  cmds.push(["SET", "laorvia:home:testimonials", JSON.stringify(data.home.testimonials)]);
  cmds.push(["SET", "laorvia:home:faqs", JSON.stringify(data.home.faqs)]);
  cmds.push(["SET", "laorvia:home:promises", JSON.stringify(data.home.promises)]);
  cmds.push(["SET", "laorvia:home:tabs", JSON.stringify(data.home.tabs)]);
  cmds.push(["SET", "laorvia:meta", JSON.stringify(data.meta)]);

  // 7. Demo user, sample Indian bookings & property chat threads
  const demo = buildDemoAccount(data);
  cmds.push(["HSET", "laorvia:users", demo.user.id, JSON.stringify(demo.user)]);
  cmds.push(["HSET", "laorvia:users:byEmail", demo.user.email.toLowerCase(), demo.user.id]);
  for (const b of demo.bookings) {
    cmds.push(["HSET", "laorvia:bookings", b.ref, JSON.stringify(b)]);
    cmds.push(["SADD", `laorvia:bookings:byUser:${demo.user.id}`, b.ref]);
  }
  for (const t of demo.threads) {
    cmds.push(["HSET", "laorvia:threads", t.ref, JSON.stringify(t)]);
  }
  cmds.push(["SADD", `laorvia:saved:user:${demo.user.id}`, "the-mewar-lake-haveli", "casa-da-silva-heritage-villa"]);

  // 8. Seed verification metadata
  cmds.push([
    "SET",
    "laorvia:seed:info",
    JSON.stringify({
      version: data.version,
      seededAt: new Date().toISOString(),
      cities: data.cities.length,
      hotels: data.hotels.length,
      blogs: data.blogs.length,
      coupons: data.coupons.length,
      addons: data.addons.length,
      demoEmail: demo.user.email,
    }),
  ]);

  return cmds;
}

/** Minimal RESP2 TCP client — executes pipelined commands and verifies every response */
function executeOnRedis(cmds) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    socket.setTimeout(15000);

    let buffer = Buffer.alloc(0);
    let replies = 0;
    const errors = [];

    function parseReplies() {
      while (buffer.length > 0) {
        const type = buffer[0];
        const crlf = buffer.indexOf("\r\n");
        if (crlf === -1) return;

        if (type === 43 || type === 58) {
          // '+' simple string or ':' integer
          buffer = buffer.subarray(crlf + 2);
          replies++;
        } else if (type === 45) {
          // '-' error
          const msg = buffer.subarray(1, crlf).toString("utf8");
          errors.push(msg);
          buffer = buffer.subarray(crlf + 2);
          replies++;
        } else if (type === 36) {
          // '$' bulk string
          const len = Number(buffer.subarray(1, crlf).toString("utf8"));
          if (len === -1) {
            buffer = buffer.subarray(crlf + 2);
            replies++;
          } else {
            const total = crlf + 2 + len + 2;
            if (buffer.length < total) return;
            buffer = buffer.subarray(total);
            replies++;
          }
        } else {
          buffer = buffer.subarray(crlf + 2);
          replies++;
        }

        if (replies >= cmds.length) {
          socket.end();
          if (errors.length > 0) reject(new Error(`Redis returned ${errors.length} error(s): ${errors[0]}`));
          else resolve(replies);
          return;
        }
      }
    }

    socket.on("connect", () => {
      const payload = cmds.map(encodeResp).join("");
      socket.write(payload);
    });
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      parseReplies();
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to Redis at ${HOST}:${PORT}`));
    });
    socket.on("error", (err) => reject(err));
  });
}

async function main() {
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  const cmds = buildCommands(data);

  if (EMIT_RESP) {
    process.stdout.write(cmds.map(encodeResp).join(""));
    return;
  }

  console.log(`Connecting to Redis at ${HOST}:${PORT} (db=${DB})…`);
  const count = await executeOnRedis(cmds);
  console.log(`✔ Seeded Redis successfully (${count} commands executed).`);
  console.log(
    `  Cities: ${data.cities.length} | Hotels: ${data.hotels.length} | Blogs: ${data.blogs.length} | Coupons: ${data.coupons.length} | Add-ons: ${data.addons.length}`,
  );
  console.log(`  Demo account provisioned: ${data.meta.demoEmail} (one-tap demo login; no password is published).`);
}

main().catch((err) => {
  console.error("✖ Redis seeding failed:", err.message);
  process.exit(1);
});
