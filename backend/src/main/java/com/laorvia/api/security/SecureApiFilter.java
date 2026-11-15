package com.laorvia.api.security;

import com.laorvia.api.security.SecurityStore.Binding;
import com.laorvia.api.security.SecurityStore.StoredChannel;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Request guard for every /api/v1 endpoint:
 *  - TLS mandatory, origin allow-list, scraper UA refusal, body caps
 *  - encrypted request/response envelopes with replay protection
 *  - channel locked to device + user-agent + IP/subnet
 *  - channel bound atomically to exactly one customer ID and one session token hash
 *  - Redis rate limits per IP, per channel and per sensitive route
 *  - security headers and no-store caching
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class SecureApiFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(SecureApiFilter.class);
    private static final Set<String> PUBLIC = Set.of("/api/v1/security/handshake", "/api/v1/security/ping");
    private static final Base64.Encoder B64E = Base64.getUrlEncoder().withoutPadding();

    private final SecurityProperties props;
    private final CryptoService crypto;
    private final SecurityStore store;
    private final ClientIpResolver ipResolver;

    public SecureApiFilter(SecurityProperties props, CryptoService crypto, SecurityStore store, ClientIpResolver ipResolver) {
        this.props = props;
        this.crypto = crypto;
        this.store = store;
        this.ipResolver = ipResolver;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return !uri.startsWith("/api/v1/") || PUBLIC.contains(uri) || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String requestId = UUID.randomUUID().toString().replace("-", "");
        response.setHeader("X-Request-Id", requestId);
        applySecurityHeaders(request, response);
        applyCors(request, response);

        String path = request.getRequestURI();
        String method = request.getMethod().toUpperCase(Locale.ROOT);
        String ip = ipResolver.resolve(request);
        String ipHash = crypto.hashBinding(ipResolver.bindingKey(ip));
        String userAgent = request.getHeader("User-Agent");

        try {
            enforceTransport(request);
            enforceClient(method + " " + path, userAgent);
            enforceIpRateLimits(path, ipHash);

            if (request.getContentLengthLong() > props.getMaxBodyBytes()) {
                throw CryptoService.security(413, "SECURITY_PAYLOAD_TOO_LARGE", "Request body exceeds the permitted size.");
            }

            String keyId = trim(request.getHeader("X-LAV-Key"), 128);
            String ts = trim(request.getHeader("X-LAV-TS"), 32);
            String nonce = trim(request.getHeader("X-LAV-Nonce"), 128);
            String signature = trim(request.getHeader("X-LAV-Auth"), 256);
            String encryptedQuery = request.getHeader("X-LAV-Query");
            String encryptedTarget = request.getHeader("X-LAV-Target");
            String deviceId = trim(request.getHeader("X-LAV-Device"), 128);
            if (deviceId == null) {
                throw CryptoService.security(401, "SECURITY_DEVICE_MISSING", "Device identifier is required.");
            }

            byte[] rawBody = request.getInputStream().readNBytes(props.getMaxBodyBytes() + 1);
            if (rawBody.length > props.getMaxBodyBytes()) {
                throw CryptoService.security(413, "SECURITY_PAYLOAD_TOO_LARGE", "Request body exceeds the permitted size.");
            }

            CryptoService.OpenedRequest opened = crypto.open(
                    method, path, keyId, ts, nonce, signature, encryptedQuery, encryptedTarget, rawBody, ip, userAgent, deviceId
            );
            StoredChannel channel = opened.channel();

            String targetPath = opened.targetPath();
            if (targetPath != null) {
                targetPath = targetPath.trim();
                if (!targetPath.startsWith("/api/v1/") || targetPath.contains("..") || targetPath.startsWith("/api/v1/security")) {
                    throw CryptoService.security(400, "SECURITY_TARGET_INVALID", "Invalid dispatch target.");
                }
                enforceIpRateLimits(targetPath, ipHash);
            }
            String effectivePath = targetPath != null ? targetPath : path;

            enforceKeyRateLimit(channel.keyId(), ipHash);

            // Lock the channel to exactly one customer and one session token (atomic, first use wins).
            String sessionToken = trim(request.getHeader("X-Session-Token"), 256);
            String userId = null;
            if (sessionToken != null) {
                userId = store.userIdForToken(sessionToken)
                        .orElseThrow(() -> CryptoService.security(401, "SECURITY_SESSION_INVALID", "Your session has ended. Please sign in again."));
            }
            String tokenHash = sessionToken == null ? "" : SecurityStore.hashToken(sessionToken);
            Binding binding = store.loadBinding(channel.keyId()).orElse(null);
            Duration bindTtl = Duration.ofSeconds(props.getKeyTtlSeconds() + 30);
            if (binding != null) {
                if (userId == null || !binding.userId().equals(userId) || !binding.tokenHash().equals(tokenHash)) {
                    throw CryptoService.security(403, "SECURITY_CHANNEL_BINDING_MISMATCH",
                            "This encrypted channel belongs to a different signed-in customer. Reconnect to continue.");
                }
            } else if (userId != null) {
                Binding nowBound = store.bindOnce(channel.keyId(), userId, tokenHash, bindTtl);
                if (!nowBound.userId().equals(userId)) {
                    throw CryptoService.security(403, "SECURITY_CHANNEL_BINDING_MISMATCH",
                            "This encrypted channel is already locked to another customer.");
                }
            }

            SecureHttpRequestWrapper wrapped = new SecureHttpRequestWrapper(request, opened.body(), opened.queryString(), targetPath);
            String idempotencyKey = trim(request.getHeader("Idempotency-Key"), 128);

            RequestContext.set(new RequestContext.Context(
                    requestId, userId,
                    channel.guestToken(),
                    channel.keyId(), ipHash,
                    channel.deviceHash(), idempotencyKey, method, effectivePath, sessionToken
            ));

            byte[] plaintextResponse = null;
            int status = 200;
            ContentCachingResponseWrapper cache = new ContentCachingResponseWrapper(response);
            try {
                if (targetPath != null) {
                    request.getRequestDispatcher(targetPath).forward(wrapped, cache);
                } else {
                    chain.doFilter(wrapped, cache);
                }
                status = cache.getStatus();
                byte[] plaintext = cache.getContentAsByteArray();

                if (plaintext.length == 0 || status == 204) {
                    cache.copyBodyToResponse();
                    return;
                }
                plaintextResponse = plaintext;
            } catch (ApiSecurityException e) {
                writePlaintextSecurityError(response, e.status(), e.code(), e.getMessage(), e.retryAfterSeconds());
                return;
            } catch (Exception e) {
                log.error("Request failed requestId={} code=SERVER_ERROR", requestId);
                writePlaintextSecurityError(response, 500, "SERVER_ERROR", "Something went wrong. Please try again.", null);
                return;
            } finally {
                RequestContext.clear();
            }

            encryptAndWrite(response, channel, nonce, status, plaintextResponse);
        } catch (ApiSecurityException e) {
            if (e.retryAfterSeconds() != null) response.setHeader("Retry-After", e.retryAfterSeconds());
            writePlaintextSecurityError(response, e.status(), e.code(), e.getMessage(), e.retryAfterSeconds());
        } catch (Exception e) {
            // Fail closed: never let the container render a stack trace or an unencrypted body.
            log.error("Security filter failure requestId={} type={}", requestId, e.getClass().getSimpleName());
            writePlaintextSecurityError(response, 503, "SECURITY_UNAVAILABLE", "Service temporarily unavailable.", "30");
        }
    }

    /* ───────────────────────── guards ───────────────────────── */

    private void enforceTransport(HttpServletRequest request) {
        if (props.isTlsRequired() && !ipResolver.isSecure(request)) {
            throw CryptoService.security(403, "SECURITY_TLS_REQUIRED", "HTTPS is required for the Laorvia API.");
        }
    }

    private void enforceClient(String action, String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            throw CryptoService.security(403, "SECURITY_CLIENT_REJECTED", "Client signature rejected.");
        }
        String lower = userAgent.toLowerCase(Locale.ROOT);
        for (String token : props.getBlockedUserAgentTokens()) {
            if (!token.isBlank() && lower.contains(token.toLowerCase(Locale.ROOT))) {
                log.warn("Blocked automated client action={} reason=ua-token", action);
                throw CryptoService.security(403, "SECURITY_CLIENT_REJECTED", "Automated access is not permitted.");
            }
        }
    }

    private void enforceIpRateLimits(String path, String ipHash) {
        Duration minute = Duration.ofMinutes(1);
        if (store.hit("ip:" + ipHash, minute) > props.getRequestsPerMinutePerIp()) {
            throw new ApiSecurityException(429, "SECURITY_RATE_LIMIT",
                    "Too many requests. Please slow down.", String.valueOf(store.retryAfterSeconds(minute)));
        }
        if (path.startsWith("/api/v1/bootstrap") && store.hit("bootstrap:" + ipHash, minute) > props.getBootstrapPerMinutePerIp()) {
            throw new ApiSecurityException(429, "SECURITY_RATE_LIMIT", "Catalog refresh limit reached.", "60");
        }
        if (path.startsWith("/api/v1/auth") && store.hit("auth:" + ipHash, minute) > props.getAuthPerMinutePerIp()) {
            throw new ApiSecurityException(429, "SECURITY_RATE_LIMIT", "Too many authentication attempts.", "60");
        }
    }

    private void enforceKeyRateLimit(String keyId, String ipHash) {
        Duration minute = Duration.ofMinutes(1);
        if (store.hit("key:" + keyId, minute) > props.getRequestsPerMinutePerKey()) {
            throw new ApiSecurityException(429, "SECURITY_RATE_LIMIT",
                    "Too many requests on this encrypted session.", String.valueOf(store.retryAfterSeconds(minute)));
        }
        if (store.hit("ipkey:" + ipHash + ":" + keyId, minute) > props.getRequestsPerMinutePerIp()) {
            throw new ApiSecurityException(429, "SECURITY_RATE_LIMIT",
                    "Request budget exhausted for this network.", String.valueOf(store.retryAfterSeconds(minute)));
        }
    }

    /* ───────────────────────── response helpers ───────────────────────── */

    private void encryptAndWrite(HttpServletResponse response, StoredChannel channel, String requestNonce, int status, byte[] plaintext) throws IOException {
        byte[] envelope = crypto.encryptResponse(channel, requestNonce, status, plaintext);
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.setContentLength(envelope.length);
        response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        response.setHeader("Pragma", "no-cache");
        response.getOutputStream().write(envelope);
        response.getOutputStream().flush();
    }

    private void writePlaintextSecurityError(HttpServletResponse response, int status, String code, String message, String retryAfter) {
        try {
            if (retryAfter != null) response.setHeader("Retry-After", retryAfter);
            response.setStatus(status);
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.setHeader("Cache-Control", "no-store");
            String safeMessage = message == null ? "Request rejected." : message.replace("\"", "'");
            String body = "{\"status\":" + status + ",\"error\":\"" + code + "\",\"message\":\"" + safeMessage + "\"}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            response.setContentLength(bytes.length);
            response.getOutputStream().write(bytes);
            response.getOutputStream().flush();
        } catch (IOException ignored) {
            // response already committed
        }
    }

    private void applySecurityHeaders(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
        response.setHeader("Cross-Origin-Resource-Policy", "same-site");
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        if (ipResolver.isSecure(request)) {
            response.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
        }
    }

    private void applyCors(HttpServletRequest request, HttpServletResponse response) {
        String origin = request.getHeader("Origin");
        if (origin != null && props.getAllowedOrigins().contains(origin)) {
            response.setHeader("Access-Control-Allow-Origin", origin);
            response.setHeader("Vary", "Origin");
            response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-LAV-Key, X-LAV-TS, X-LAV-Nonce, X-LAV-Auth, X-LAV-Query, X-LAV-Target, X-LAV-Device, X-Session-Token, X-Guest-Token, Idempotency-Key");
            response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
            response.setHeader("Access-Control-Expose-Headers", "X-Request-Id, Retry-After");
            response.setHeader("Access-Control-Max-Age", "600");
        }
    }

    private static String trim(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String t = value.trim();
        return t.length() > max ? null : t;
    }
}
