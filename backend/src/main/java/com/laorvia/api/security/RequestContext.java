package com.laorvia.api.security;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Per-request security context resolved exclusively by SecureApiFilter.
 * Controllers and services must never trust a client-supplied user ID.
 */
public final class RequestContext {

    public record Context(
            String requestId,
            String userId,
            String guestToken,
            String keyId,
            String ipHash,
            String deviceHash,
            String idempotencyKey,
            String method,
            String path,
            String sessionToken
    ) {}

    private static final ThreadLocal<Context> HOLDER = new ThreadLocal<>();

    private RequestContext() {}

    static void set(Context context) {
        HOLDER.set(context);
    }

    static void clear() {
        HOLDER.remove();
    }

    public static Context get() {
        return HOLDER.get();
    }

    public static String requestId() {
        Context c = HOLDER.get();
        return c == null ? "unknown" : c.requestId();
    }

    /** Authenticated customer ID, or null for a guest channel. */
    public static String userIdOrNull() {
        Context c = HOLDER.get();
        return c == null ? null : c.userId();
    }

    public static String requireUserId() {
        String id = userIdOrNull();
        if (id == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in to continue.");
        }
        return id;
    }

    public static String guestToken() {
        Context c = HOLDER.get();
        return c == null ? null : c.guestToken();
    }

    public static String keyId() {
        Context c = HOLDER.get();
        return c == null ? null : c.keyId();
    }

    public static String ipHash() {
        Context c = HOLDER.get();
        return c == null ? null : c.ipHash();
    }

    public static String sessionToken() {
        Context c = HOLDER.get();
        return c == null ? null : c.sessionToken();
    }

    public static String idempotencyKey() {
        Context c = HOLDER.get();
        return c == null ? null : c.idempotencyKey();
    }

    /** True only when the server-bound channel is authenticated to a real customer. */
    public static boolean isAuthenticated() {
        return userIdOrNull() != null;
    }
}
