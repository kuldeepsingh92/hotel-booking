# Laorvia API — Spring Boot 4.1.2 + Redis

Redis-only REST API for **laorvia.com**. Every destination, hotel, rate, coupon, guide,
user, session, booking, review, wishlist entry and chat message lives in Redis.
Nothing sensitive is persisted in the browser beyond an opaque bearer token (sessionStorage)
and an anonymous device identifier.

## Security at a glance

- **TLS is mandatory** (`LAORVIA_TLS_REQUIRED=true`). Refuse plain HTTP outside localhost.
- **LAV1 encrypted channel** on every endpoint except the key handshake:
  ephemeral **ECDH P-256 → HKDF-SHA256 → AES-256-GCM** for request *and* response bodies and queries,
  with **HMAC-SHA256** request authentication.
- **Replay-proof**: ±60 s timestamp window plus single-use Redis nonces.
- **Channel locking**: device, user-agent, IP (STRICT or SUBNET) and, once signed in,
  exactly one customer ID + SHA-256 of the exact bearer token. Any mismatch revokes the channel.
- **Identity is server-side only**: controllers read `RequestContext`, never a client-supplied user ID.
  Booking ownership, review eligibility and payment amounts are re-checked on the server.
- **Sessions** are 256-bit random tokens stored only as SHA-256 hashes, revocable per customer.
- **Passwords** use PBKDF2-HMAC-SHA256, 310,000 iterations, 128-bit per-user salt.
- **Redis channel keys** are wrapped with an external KEK (AES-256-GCM). A Redis dump is useless without it.
- **Rate limiting** per IP, per channel and per sensitive route, plus login lockout (5 failures / 15 min).
- **Headers/hygiene**: HSTS behind TLS, `nosniff`, `DENY` framing, no-store, generic errors,
  no stack traces, blocked scraper user agents, request-size caps, idempotency keys on money operations.
- **Forward secrecy**: the ECDH private key is discarded after the handshake; recorded traffic cannot
  be decrypted later, even if the KEK is later compromised.

Read [`../SECURITY.md`](../SECURITY.md) for the full threat model and the honest limits of
browser-side encryption.

## Required secrets

```bash
openssl rand -base64 32   # LAORVIA_SECURITY_KEK
openssl rand -base64 48   # LAORVIA_SECURITY_IP_PEPPER
```

Set `LAORVIA_SECURITY_KEK`, `LAORVIA_SECURITY_IP_PEPPER`, `LAORVIA_TLS_REQUIRED=true`,
`LAORVIA_TRUSTED_PROXY_COUNT` (exact proxy count) and `LAORVIA_ALLOWED_ORIGINS`.
See [`.env.example`](.env.example). The service fails fast when secrets are missing
(unless `LAORVIA_ALLOW_EPHEMERAL_KEK=true`, which is dev-only).

## Run

**Docker demo (local only, HTTP + demo login relaxed):**
```bash
cd backend
docker compose up -d --build
```
Then seed Redis:
```bash
REDIS_HOST=127.0.0.1 REDIS_PASSWORD=local-demo-redis-only node ../scripts/seed-redis.mjs
```

**Manual (recommended for development):**
```bash
# 1. Start Redis 7 with a password / ACL.
# 2. Populate it (PBKDF2-hashed demo account included):
node scripts/seed-redis.mjs
# 3. Start the API:
cd backend
LAORVIA_ALLOW_EPHEMERAL_KEK=true \
LAORVIA_SECURITY_IP_PEPPER=dev-only-pepper-change-this-value \
LAORVIA_TLS_REQUIRED=false \
LAORVIA_DEMO_LOGIN=true \
mvn spring-boot:run
# 4. Frontend (HTTPS or localhost):
npm run dev
```

Production: `--spring.profiles.active=prod` with real secrets, TLS termination, a same-origin
reverse proxy for `/api/v1`, Redis TLS + ACL, and demo seeding disabled.

## Tests

```bash
cd backend && mvn test                 # HKDF RFC 5869, PBKDF2, binding hashes, context
node scripts/security-selftest.mjs     # real browser crypto ↔ Spring contract end-to-end
```

The self-test drives `src/lib/secureChannel.ts` against a reference implementation of the
Java protocol: encrypted bootstrap, customer/token binding, and device-mismatch rejection.

With a live server running, prove the real interop end-to-end:

```bash
node scripts/live-e2e.mjs      # real frontend crypto ↔ real Spring Boot ↔ real Redis
```

It verifies encrypted bootstrap, coupon rules, idempotent booking + payment, over-capacity
rejection, chat persistence, cross-customer denial, channel/token mismatches, device changes
and anonymous downgrade attempts.

## Secure-channel headers

| Header | Purpose |
| --- | --- |
| `X-LAV-Key` | Channel key id from the handshake |
| `X-LAV-TS` | Unix seconds (±60 s) |
| `X-LAV-Nonce` | Base64url 128-bit single-use nonce |
| `X-LAV-Auth` | HMAC-SHA256 over method, path, key, ts, nonce and both ciphertext hashes |
| `X-LAV-Query` | AES-256-GCM envelope of the URL query string |
| `X-LAV-Device` | Anonymous device id bound at handshake |
| `X-Session-Token` | Bearer token (TLS-protected; bound to the channel) |
| `Idempotency-Key` | Required for replay-safe booking/payment retries |

Handshake: `POST /api/v1/security/handshake` with an ephemeral client public key and nonce.
No secret is transmitted; the client verifies the HMAC key confirmation before trusting the channel.

## Redis keys

`laorvia:cities`, `laorvia:hotels`, `laorvia:hotels:byCity:*`, `laorvia:landmarks:*`,
`laorvia:hosts`, `laorvia:coupons`, `laorvia:addons`, `laorvia:blogs`, `laorvia:home:*`,
`laorvia:meta`, `laorvia:users`, `laorvia:users:byEmail`, `laorvia:bookings`,
`laorvia:bookings:byUser:*`, `laorvia:bookings:guest:*`, `laorvia:threads`, `laorvia:saved:*`,
plus `laorvia:sec:*` for wrapped channels, nonces, rate limits, hashed sessions, login
throttles, idempotency and channel→customer bindings.

Never expose Redis publicly. Use a dedicated ACL user limited to `laorvia:*`, TLS,
`requirepass`, and rename/disable `FLUSHALL`, `FLUSHDB` and `CONFIG`.
