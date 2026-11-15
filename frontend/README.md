# Laorvia — laorvia.com

India-first hotel booking portal (React + Vite + Tailwind) with a parallel
**Spring Boot 4.1.2 + Redis** API. The frontend ships **zero static catalogue data**;
every destination, stay, rate, coupon, guide, booking, review and chat message is read
from Redis through the API.

## Architecture

```
React (this repo, /src)  ──LAV1 authenticated encryption over HTTPS──▶  Spring Boot 4.1.2 (/backend)
                                                                          │
                                                                          ▼
                                                                    Redis 7 (laorvia:* keys)
                                                                          ▲
                                            scripts/seed-redis.mjs ───────┘
```

- **Encrypted channel**: ephemeral ECDH P-256 → HKDF-SHA256 → AES-256-GCM (request + response)
  and HMAC-SHA256 request signing. Single-use nonces, ±60 s timestamps, response AAD bound to
  the request nonce and status.
- **Request locking**: device + user-agent + IP/subnet, and once signed in, exactly one
  customer ID and the SHA-256 of the exact bearer token. Identity reaches controllers only
  through `RequestContext`, never from the client.
- **Redis-only data**, hashed sessions, PBKDF2 passwords, KEK-wrapped channel keys,
  login lockout, idempotent payments, per-IP/channel/route rate limits, scraper-UA refusal,
  security headers, generic errors and CSP.

Read [SECURITY.md](SECURITY.md) for the threat model — including the honest limits of
browser-side encryption — and the production checklist.

## Run locally

```bash
# 1. Redis (with a password) + seed
node scripts/seed-redis.mjs

# 2. Backend (Java 21, Maven 3.9+)
cd backend
LAORVIA_ALLOW_EPHEMERAL_KEK=true \
LAORVIA_SECURITY_IP_PEPPER=dev-only-pepper-change-this-value \
LAORVIA_TLS_REQUIRED=false \
LAORVIA_DEMO_LOGIN=true \
mvn spring-boot:run

# 3. Frontend (HTTPS or localhost)
npm run dev
```

Or use `backend/docker-compose.yml` for a self-contained local demo.
Production must use the `prod` profile with real secrets from a KMS/secret manager, TLS,
a same-origin reverse proxy for `/api/v1`, and Redis ACL + TLS.

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Frontend API base (default `http://localhost:8080/api/v1`; prefer `/api/v1` behind a same-origin proxy) |
| `LAORVIA_SECURITY_KEK` | Base64 32-byte key-encryption key (required in production) |
| `LAORVIA_SECURITY_IP_PEPPER` | Long random pepper for binding hashes (required) |
| `LAORVIA_TLS_REQUIRED` | `true` in production |
| `LAORVIA_TRUSTED_PROXY_COUNT` | Exact number of reverse proxies |
| `LAORVIA_IP_BINDING_MODE` | `STRICT` (default) or `SUBNET` |
| `LAORVIA_ALLOWED_ORIGINS` | Comma-separated browser origins |
| `LAORVIA_DEMO_LOGIN` | `false` in production |
| `REDIS_HOST/PORT/PASSWORD/TLS` | Redis connection (ACL user supported) |

## Verification

```bash
npx tsc --noEmit && npm run build
node scripts/security-selftest.mjs     # RFC 5869 HKDF + real frontend ↔ Spring contract
cd backend && mvn test                 # Java crypto, PBKDF2 and binding tests
node scripts/live-e2e.mjs              # real frontend ↔ real Spring Boot ↔ real Redis
```

The demo account is `demo@laorvia.com`; use the one-tap demo button (no password is
published in the app or API metadata).
