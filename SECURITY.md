# Laorvia Security Model

This document describes exactly what the Laorvia portal protects, how, and — equally
important — what application-layer encryption **cannot** guarantee for a browser app.

## 1. Threat model

| Threat | Control |
| --- | --- |
| Passive network interception | TLS 1.2+ mandatory; AEAD payload layer as defence-in-depth |
| Recorded traffic decrypted later | Per-handshake ECDH private keys are discarded (forward secrecy); Redis stores only derived keys |
| Redis dump / backup leak | Channel keys wrapped with an external KEK (AES-256-GCM); session keys are never stored in plaintext |
| Request tampering | AES-256-GCM + HMAC-SHA256 over method, path, headers and both ciphertexts |
| Replay / request reordering | ±60 s timestamp window + single-use nonce stored in Redis |
| Response injection | Separate response key; AAD binds response to the request nonce and HTTP status |
| Stolen bearer token | Sessions stored only as SHA-256 hashes; channel locked to IP/device/UA and to that exact token hash |
| Cross-account data access (IDOR) | Customer identity comes only from `RequestContext`; ownership re-checked in services |
| Credential stuffing | PBKDF2-HMAC-SHA256 (310k, salted) + Redis login lockout (5 failures / 15 min per email + IP) |
| Bulk scraping | Encrypted channel required, per-IP / per-channel / per-route rate limits, UA refusal, body caps, no pagination beyond caps |
| Secret leakage through errors | Generic error bodies, no stack traces (`server.error.*`), encrypted error responses, no PII in logs |
| Clickjacking / MIME sniffing | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, COOP/CORP, HSTS behind TLS |
| Double charging | `Idempotency-Key` on booking + pay, stored 24 h in Redis |

## 2. Secure channel protocol (LAV1)

- **Handshake** `POST /api/v1/security/handshake` (TLS, origin allow-list, rate-limited)
  - Client sends an ephemeral P-256 public key, a 32-byte nonce, an anonymous device ID and the guest token.
  - Server replies with its ephemeral P-256 public key, a nonce, a key ID and an HMAC key-confirmation value.
  - Neither side ever transmits the shared secret.
- **Derivation** (identical in `src/lib/secureChannel.ts` and `CryptoService.java`)
  - `salt = SHA-256("LAV1-SALT:" || clientNonce || serverNonce || clientPub || serverPub)`
  - `shared = ECDH(P-256)`
  - `requestKey  = HKDF-SHA256(shared, salt, "LAV1-REQ", 32)`
  - `responseKey = HKDF-SHA256(shared, salt, "LAV1-RES", 32)`
  - `authKey     = HKDF-SHA256(shared, salt, "LAV1-AUTH", 32)`
  - `confirmation = HMAC-SHA256(authKey, "LAV1-CONFIRM" || clientNonce || serverNonce || keyId)`
- **Request**
  - Body and query string (URL-encoded) are encrypted with AES-256-GCM.
  - `AAD = "LAV1-AAD\n" || keyId || "\n" || timestamp || "\n" || nonce`
  - `X-LAV-Auth = HMAC(authKey, "LAV1-SIG\n" || method || path || keyId || timestamp || nonce || sha256(bodyCipher) || sha256(queryCipher) [ || sha256(targetCipher) ])`
  - **Route Obfuscation (Traffic Analysis Resistance)**:
    - To prevent eavesdroppers and intermediate proxies from inspecting which actions or endpoints are accessed, requests can target `/api/v1/dispatch` while carrying an encrypted target path in `X-LAV-Target`.
    - The server decrypts `X-LAV-Target`, verifies signature integrity, enforces route-specific rate limits, and forwards the request internally to the target controller while preserving real HTTP status codes.
- **Response**
  - AES-256-GCM with the response key.
  - `AAD = "LAV1-RES\n" || keyId || "\n" || requestNonce || "\n" || status`

Channel TTL defaults to 30 minutes; the client re-handshakes transparently.

## 3. Request locking

Every request on `/api/v1/**` is checked, in order, for:

1. **TLS** (`X-Forwarded-Proto` trusted only when `trustedProxyCount > 0`).
2. **Origin allow-list** and an explicit refusal of known automated user agents.
3. **Client IP** resolved without blind `X-Forwarded-For` trust.
4. **Per-IP rate limit** (240/min default) and sensitive-route budgets.
5. **Channel key** presence, expiry and **device / user-agent / IP binding**
   (`STRICT` full IP by default; `SUBNET` tolerates mobile network changes).
6. **HMAC signature** verified in constant time.
7. **Nonce + timestamp** replay protection.
8. **Per-channel rate limit**.
9. **Customer binding** — the first authenticated request atomically locks the channel to
   one `userId` and the SHA-256 of the exact bearer token. Any later request using a
   different user, token, or *without* a token is rejected (`SECURITY_CHANNEL_BINDING_MISMATCH`).
10. **Identity injection** — controllers/services read `RequestContext`, never a client-supplied user ID.

Successful and rejected security events are logged with a request ID and hashed
identifiers only. Bodies, tokens and keys are never logged.

## 4. Secrets and key management

| Secret | Where it lives | Rotation |
| --- | --- | --- |
| `LAORVIA_SECURITY_KEK` (32 B base64) | Secret manager / KMS injected as env; **never** in git or Redis | Re-wrap channel records with a new KEK during a maintenance window |
| `LAORVIA_SECURITY_IP_PEPPER` (≥16 chars) | Secret manager | Rotating invalidates live channel bindings (users re-handshake) |
| Redis password / ACL user | Secret manager | 90-day rotation |
| TLS certificates | Load balancer / ACME | Automated |

Per-session channel keys live **only** in Redis, wrapped with the KEK. Discarding the
ECDH private key after the handshake means captured ciphertext cannot be decrypted later,
even by someone who later obtains the KEK.

## 4a. Scope of the encrypted layer

The LAV1 envelope encrypts **request bodies and query strings**, and **all response bodies**
(including error responses produced by the API). Transport headers — the bearer token,
nonces, timestamps, HMAC and device id — remain visible to a network observer and are
protected by **TLS**, which is mandatory. The frontend keeps the bearer token in
`sessionStorage` (not `localStorage`) so it disappears when the tab closes; a production
deployment should move it to an `HttpOnly; Secure; SameSite=Strict` cookie issued by a
same-origin gateway, with CSRF double-submit protection.

## 4b. Configuration cautions

- Tighten the CSP `connect-src` to the exact API origin. The bundled meta policy allows any
  HTTPS host so the runtime-configurable API URL works; an XSS would otherwise be able to
  exfiltrate data. A same-origin production proxy (`/api/v1`) removes this flexibility.
- Replace the CSP meta tag with a server header and a build-specific script hash.
- Remove the demo seeder and the demo login endpoint from production.
- Sign-up returns a conflict for an existing email (account enumeration). This is a deliberate
  UX trade-off; rate-limit sign-ups at the edge and monitor for enumeration patterns.
- Payments in this prototype never touch a real gateway. Integrate a PCI-DSS compliant
  provider with server-side intent creation, 3-D Secure/UPI intent verification and webhooks.
- Reviews and chat are stored as plain text and rendered as text (React escapes). Add
  moderation and URL/spam filters before launch.

## 5. What browser-side encryption cannot do — read this

A web app must be able to decrypt the data it displays. A determined attacker can:

- open DevTools, read the JS bundle and call the same code paths the app uses;
- drive a real browser (Playwright/Puppeteer) with a valid account;
- extract a user's own decrypted data and scrape it.

Therefore it is **not accurate** to claim that "without an internal leak nobody can decode
the data." What this design does achieve:

- Plain-text API payloads no longer exist on the wire, so curl/Postman replay, naive
  proxies, log-scraping and scripted bulk extraction are blocked.
- Requests cannot be replayed, altered, or moved to another user/IP/device.
- A Redis dump alone does not reveal channel keys or usable bearer tokens.
- Each session is isolated, expiring and fingerprinted, so credential sharing and
  scraping leave a detectable trail.

For a categorical guarantee, add **attested clients** (Android Play Integrity / iOS App
Attest with keys in the Secure Enclave / StrongBox), **mTLS client certificates**,
commercial bot management, and legal terms with monitoring. Those require native apps or
a reverse proxy you control; they are not achievable purely in frontend JavaScript.

## 6. Production deployment checklist

- [ ] Terminate TLS 1.2+/1.3 at a load balancer; redirect all HTTP → HTTPS; enable HSTS preload.
- [ ] Run Spring Boot with `--spring.profiles.active=prod`; inject `LAORVIA_SECURITY_KEK` and `LAORVIA_SECURITY_IP_PEPPER` from a secret manager.
- [ ] Keep `allow-ephemeral-kek=false` and `demo-login-enabled=false`.
- [ ] `trustedProxyCount` = exact number of proxies; ensure only the load balancer can reach the app port.
- [ ] Serve the frontend and API from the **same origin** (`/api/v1`) to eliminate CORS and simplify CSP.
- [ ] Replace `'unsafe-inline'` in the CSP meta with a server header using the build's script SHA-256 hash.
- [ ] Redis: ACL user limited to `laorvia:*`, `requirepass`, TLS, no public port, FLUSH/CONFIG renamed, separate network.
- [ ] Remove the demo seeder from production; provision real hotels through an audited admin process.
- [ ] Centralised audit logs (request ID, hashed IP, user ID, route, outcome) with alerting on 401/403/429 spikes.
- [ ] WAF rules: OWASP CRS, bot score on `/api/v1/**`, rate limits mirrored at the edge.
- [ ] Dependency and container scanning in CI; pin images; run as non-root.
- [ ] Penetration test covering IDOR, replay, binding bypass, rate-limit races, and key-extraction scenarios.
- [ ] Backups: Redis snapshots encrypted at rest; KEK stored separately.
- [ ] India DPDP Act / GDPR records, retention limits, and a documented breach-notification runbook.

## 7. Incident response

1. Revoke the affected customer's sessions (`deleteAllSessionsForUser`) and encrypted channels.
2. Rotate the KEK, re-wrap active channels, then invalidate them.
3. Rotate the IP pepper (forces every client to re-bind).
4. Rotate Redis credentials and TLS certificates.
5. Preserve audit logs (request IDs and hashed identifiers only), then analyse the replay/binding alerts.
6. Notify affected users and regulators as required.
