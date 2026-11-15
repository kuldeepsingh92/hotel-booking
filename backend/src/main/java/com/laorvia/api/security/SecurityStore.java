package com.laorvia.api.security;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;

/**
 * Redis-backed security state: wrapped channel keys, nonces, rate limits,
 * hashed session tokens, channel→customer bindings, login throttles and
 * idempotency keys. No raw bearer token is ever persisted.
 */
@Repository
public class SecurityStore {

    private static final String PREFIX = "laorvia:sec:";
    private static final String CRYPTO = PREFIX + "crypto:";
    private static final String BIND = PREFIX + "bind:";
    private static final String NONCE = PREFIX + "nonce:";
    private static final String RATE = PREFIX + "rl:";
    private static final String SESSION = PREFIX + "session:";
    private static final String USER_SESSIONS = PREFIX + "user-sessions:";
    private static final String LOGIN_FAIL = PREFIX + "loginfail:";
    private static final String IDEMPOTENCY = PREFIX + "idem:";

    private static final SecureRandom RNG = new SecureRandom();
    private static final Base64.Encoder B64E = Base64.getUrlEncoder().withoutPadding();

    public record StoredChannel(
            String keyId,
            String requestKey,
            String responseKey,
            String authKey,
            String deviceHash,
            String ipHash,
            String userAgentHash,
            String guestToken,
            long issuedAt,
            long expiresAt
    ) {}

    private final StringRedisTemplate redis;
    private final JsonMapper json;
    private final KeyVault vault;

    public SecurityStore(StringRedisTemplate redis, JsonMapper json, KeyVault vault) {
        this.redis = redis;
        this.json = json;
        this.vault = vault;
    }

    /* ── channel keys (wrapped at rest) ── */

    public void saveChannel(StoredChannel channel, Duration ttl) {
        redis.opsForValue().set(CRYPTO + channel.keyId(), vault.wrap(channel.keyId(), json.writeValueAsString(channel)), ttl);
    }

    public Optional<StoredChannel> loadChannel(String keyId) {
        if (keyId == null || keyId.isBlank() || keyId.length() > 128) return Optional.empty();
        String wrapped = redis.opsForValue().get(CRYPTO + keyId);
        if (wrapped == null) return Optional.empty();
        try {
            return Optional.of(json.readValue(vault.unwrap(keyId, wrapped), StoredChannel.class));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    public void deleteChannel(String keyId) {
        if (keyId != null && !keyId.isBlank()) {
            redis.delete(CRYPTO + keyId);
            redis.delete(BIND + keyId);
        }
    }

    /* ── atomic channel → (customer, exact session token hash) binding ── */

    public record Binding(String userId, String tokenHash) {}

    public Optional<Binding> loadBinding(String keyId) {
        String raw = redis.opsForValue().get(BIND + keyId);
        if (raw == null) return Optional.empty();
        String[] parts = raw.split("\\|", 2);
        if (parts.length != 2) return Optional.empty();
        return Optional.of(new Binding(parts[0], parts[1]));
    }

    /** Atomic first-writer-wins binding. Returns the binding that is now authoritative. */
    public Binding bindOnce(String keyId, String userId, String tokenHash, Duration ttl) {
        String value = userId + "|" + tokenHash;
        Boolean inserted = redis.opsForValue().setIfAbsent(BIND + keyId, value, ttl);
        if (Boolean.TRUE.equals(inserted)) {
            return new Binding(userId, tokenHash);
        }
        return loadBinding(keyId).orElse(new Binding(userId, tokenHash));
    }

    /* ── replay protection ── */

    public boolean consumeNonce(String keyId, String nonce, Duration ttl) {
        Boolean fresh = redis.opsForValue().setIfAbsent(NONCE + keyId + ":" + nonce, "1", ttl);
        return Boolean.TRUE.equals(fresh);
    }

    /* ── rate limiting (fixed window, Redis atomic INCR) ── */

    public long hit(String bucket, Duration window) {
        String key = RATE + bucket + ":" + (System.currentTimeMillis() / window.toMillis());
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redis.expire(key, window.plusSeconds(5));
        }
        return count == null ? 1L : count;
    }

    public long retryAfterSeconds(Duration window) {
        long windowMs = window.toMillis();
        return Math.max(1, (windowMs - (System.currentTimeMillis() % windowMs)) / 1000);
    }

    /* ── auth sessions: only SHA-256 of the bearer token is stored ── */

    public static String hashToken(String rawToken) {
        if (rawToken == null) return "";
        return B64E.encodeToString(KeyVault.sha256(rawToken.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    public String createSession(String userId, Duration ttl) {
        byte[] bytes = new byte[32];
        RNG.nextBytes(bytes);
        String token = B64E.encodeToString(bytes);
        String hash = hashToken(token);
        redis.opsForValue().set(SESSION + hash, userId, ttl);
        redis.opsForSet().add(USER_SESSIONS + userId, hash);
        redis.expire(USER_SESSIONS + userId, ttl);
        return token;
    }

    /** Revokes every session for a customer except the browser performing the change. */
    public void deleteOtherSessionsForUser(String userId, String keepRawToken) {
        String keep = hashToken(keepRawToken);
        var members = redis.opsForSet().members(USER_SESSIONS + userId);
        if (members != null) {
            for (String hash : members) {
                if (!hash.equals(keep)) redis.delete(SESSION + hash);
            }
        }
        redis.opsForSet().add(USER_SESSIONS + userId, keep);
    }

    /** Revokes every issued session for a customer (password change, deletion, incident). */
    public void deleteAllSessionsForUser(String userId) {
        var members = redis.opsForSet().members(USER_SESSIONS + userId);
        if (members != null && !members.isEmpty()) {
            for (String hash : members) redis.delete(SESSION + hash);
        }
        redis.delete(USER_SESSIONS + userId);
    }

    public Optional<String> userIdForToken(String rawToken) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 256) return Optional.empty();
        return Optional.ofNullable(redis.opsForValue().get(SESSION + hashToken(rawToken)));
    }

    public void deleteSession(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return;
        String hash = hashToken(rawToken);
        String userId = redis.opsForValue().get(SESSION + hash);
        redis.delete(SESSION + hash);
        if (userId != null) redis.opsForSet().remove(USER_SESSIONS + userId, hash);
    }

    /* ── login brute-force throttle (by email hash + IP hash) ── */

    public boolean loginLocked(String emailHash, String ipHash) {
        String value = redis.opsForValue().get(LOGIN_FAIL + emailHash + ":" + ipHash);
        return value != null && value.startsWith("LOCKED:");
    }

    public int recordLoginFailure(String emailHash, String ipHash, int maxFailures, Duration lock) {
        String key = LOGIN_FAIL + emailHash + ":" + ipHash;
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) redis.expire(key, lock);
        if (count != null && count >= maxFailures) {
            redis.opsForValue().set(key, "LOCKED:" + count, lock);
        }
        return count == null ? 1 : count.intValue();
    }

    public void clearLoginFailures(String emailHash, String ipHash) {
        redis.delete(LOGIN_FAIL + emailHash + ":" + ipHash);
    }

    /* ── idempotency for money-moving requests ── */

    public Optional<String> idempotentResult(String scope, String key) {
        if (key == null || key.isBlank()) return Optional.empty();
        return Optional.ofNullable(redis.opsForValue().get(IDEMPOTENCY + scope + ":" + key));
    }

    public void saveIdempotentResult(String scope, String key, String value, Duration ttl) {
        if (key == null || key.isBlank()) return;
        redis.opsForValue().setIfAbsent(IDEMPOTENCY + scope + ":" + key, value, ttl);
    }
}
