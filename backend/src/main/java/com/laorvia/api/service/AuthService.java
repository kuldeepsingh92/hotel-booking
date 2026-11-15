package com.laorvia.api.service;

import com.laorvia.api.model.Models.*;
import com.laorvia.api.repository.RedisStoreRepository;
import com.laorvia.api.security.CryptoService;
import com.laorvia.api.security.RequestContext;
import com.laorvia.api.security.SecurityProperties;
import com.laorvia.api.security.SecurityStore;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDate;
import java.util.*;

@Service
public class AuthService {

    private static final int PBKDF2_ITERATIONS = 310_000;
    private static final int PBKDF2_BITS = 256;
    private static final SecureRandom RNG = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getEncoder();
    private static final Base64.Decoder B64D = Base64.getDecoder();
    private static final Duration SESSION_TTL = Duration.ofDays(30);
    private static final String GENERIC_LOGIN_ERROR = "Email and password don't match an account. Check both and try again.";

    private final RedisStoreRepository store;
    private final SecurityStore security;
    private final SecurityProperties props;
    private final CryptoService crypto;

    public AuthService(RedisStoreRepository store, SecurityStore security, SecurityProperties props, CryptoService crypto) {
        this.store = store;
        this.security = security;
        this.props = props;
        this.crypto = crypto;
    }

    /* ───────────────────────── sign-up / sign-in ───────────────────────── */

    public AuthResponse signUp(SignUpRequest req) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (store.getUserByEmail(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "There's already an account with that email. Sign in instead.");
        }
        if (req.password().length() < 8 || req.password().length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a password of at least 8 characters.");
        }

        User user = new User(
                "u_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12),
                req.firstName().trim(),
                req.lastName().trim(),
                email,
                hashPassword(req.password()),
                "",
                "India",
                req.marketing(),
                LocalDate.now().toString()
        );
        store.saveUser(user);
        store.claimGuestBookings(RequestContext.guestToken(), user.id());
        store.mergeGuestSaved(RequestContext.guestToken(), user.id());

        String token = security.createSession(user.id(), SESSION_TTL);
        return buildAuthResponse(token, user);
    }

    public AuthResponse signIn(LoginRequest req) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        String emailHash = crypto.hashBinding(email);
        String ipHash = RequestContext.ipHash() == null ? "unknown" : RequestContext.ipHash();

        if (security.loginLocked(emailHash, ipHash)) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed attempts. Try again in " + props.getLoginLockMinutes() + " minutes."
            );
        }

        Optional<User> candidate = store.getUserByEmail(email);
        boolean valid = candidate.isPresent() && verifyPassword(req.password(), candidate.get().passwordHash());
        if (!valid) {
            security.recordLoginFailure(emailHash, ipHash, props.getLoginMaxFailures(),
                    Duration.ofMinutes(props.getLoginLockMinutes()));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, GENERIC_LOGIN_ERROR);
        }

        User user = candidate.get();
        security.clearLoginFailures(emailHash, ipHash);
        store.claimGuestBookings(RequestContext.guestToken(), user.id());
        store.mergeGuestSaved(RequestContext.guestToken(), user.id());
        String token = security.createSession(user.id(), SESSION_TTL);
        return buildAuthResponse(token, user);
    }

    public AuthResponse signInDemo() {
        if (!props.isDemoLoginEnabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The demo account is disabled on this deployment.");
        }
        String demoEmail = store.getMeta().map(PortalMeta::demoEmail).orElse("demo@laorvia.com");
        User demo = store.getUserByEmail(demoEmail)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.SERVICE_UNAVAILABLE,
                        "Demo account is not provisioned in Redis yet. Run `node scripts/seed-redis.mjs`."
                ));
        store.claimGuestBookings(RequestContext.guestToken(), demo.id());
        store.mergeGuestSaved(RequestContext.guestToken(), demo.id());
        String token = security.createSession(demo.id(), SESSION_TTL);
        return buildAuthResponse(token, demo);
    }

    public void logout() {
        security.deleteSession(RequestContext.sessionToken());
        security.deleteChannel(RequestContext.keyId());
    }

    public AuthResponse me() {
        User user = requireUser(RequestContext.requireUserId());
        return buildAuthResponse(RequestContext.sessionToken(), user);
    }

    /* ───────────────────────── profile ───────────────────────── */

    public PublicUser updateProfile(ProfileUpdateRequest req) {
        User user = requireUser(RequestContext.requireUserId());
        User updated = new User(
                user.id(),
                req.firstName().trim(),
                req.lastName().trim(),
                user.email(),
                user.passwordHash(),
                req.phone() == null ? "" : req.phone().trim(),
                req.country() == null ? "" : req.country().trim(),
                req.marketing(),
                user.createdAt()
        );
        store.saveUser(updated);
        return updated.toPublic();
    }

    public void changePassword(ChangePasswordRequest req) {
        User user = requireUser(RequestContext.requireUserId());
        if (!verifyPassword(req.currentPassword(), user.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That isn't your current password.");
        }
        if (req.newPassword().length() < 8 || req.newPassword().length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a new password of at least 8 characters.");
        }
        User updated = new User(
                user.id(), user.firstName(), user.lastName(), user.email(),
                hashPassword(req.newPassword()), user.phone(), user.country(), user.marketing(), user.createdAt()
        );
        store.saveUser(updated);
        // Invalidate every other device; keep this browser signed in.
        security.deleteOtherSessionsForUser(user.id(), RequestContext.sessionToken());
    }

    public void deleteAccount() {
        User user = requireUser(RequestContext.requireUserId());
        security.deleteAllSessionsForUser(user.id());
        security.deleteChannel(RequestContext.keyId());
        store.deleteUser(user);
    }

    private User requireUser(String userId) {
        return store.getUserById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Your account is no longer available."));
    }

    private AuthResponse buildAuthResponse(String token, User user) {
        List<Booking> bookings = store.getBookingsForUser(user.id());
        List<String> refs = bookings.stream().map(Booking::ref).toList();
        List<ChatThread> threads = store.getThreadsForRefs(refs);
        List<String> saved = store.getSaved("user:" + user.id());
        return new AuthResponse(token, user.toPublic(), bookings, threads, saved);
    }

    /* ───────────────────────── password hashing ───────────────────────── */

    /** PBKDF2-HMAC-SHA256, 310k iterations, 128-bit random salt. */
    public static String hashPassword(String password) {
        byte[] salt = new byte[16];
        RNG.nextBytes(salt);
        byte[] hash = pbkdf2(password.toCharArray(), salt, PBKDF2_ITERATIONS, PBKDF2_BITS);
        return "pbkdf2-sha256$" + PBKDF2_ITERATIONS + "$" + B64.encodeToString(salt) + "$" + B64.encodeToString(hash);
    }

    public static boolean verifyPassword(String password, String stored) {
        if (stored == null || password == null) return false;
        String[] parts = stored.split("\\$");
        if (parts.length != 4 || !"pbkdf2-sha256".equals(parts[0])) return false;
        try {
            int iterations = Integer.parseInt(parts[1]);
            if (iterations < 100_000 || iterations > 1_000_000) return false;
            byte[] salt = B64D.decode(parts[2]);
            byte[] expected = B64D.decode(parts[3]);
            if (salt.length < 16 || expected.length != 32) return false;
            byte[] actual = pbkdf2(password.toCharArray(), salt, iterations, expected.length * 8);
            return MessageDigest.isEqual(expected, actual);
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static byte[] pbkdf2(char[] password, byte[] salt, int iterations, int bits) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, bits);
            try {
                return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            } finally {
                spec.clearPassword();
            }
        } catch (Exception e) {
            throw new IllegalStateException("PBKDF2 unavailable", e);
        }
    }

    public static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
