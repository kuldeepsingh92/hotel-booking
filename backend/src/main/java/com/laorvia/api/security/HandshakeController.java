package com.laorvia.api.security;

import com.laorvia.api.security.SecurityDtos.HandshakeRequest;
import com.laorvia.api.security.SecurityDtos.HandshakeResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.Locale;
import java.util.Map;

/**
 * The only unencrypted endpoints. The handshake exchanges ephemeral public keys,
 * so no secret ever travels over the wire; payload confidentiality begins
 * immediately with the first encrypted request. TLS remains mandatory.
 */
@RestController
@RequestMapping("/api/v1/security")
public class HandshakeController {

    private final CryptoService crypto;
    private final SecurityProperties props;
    private final ClientIpResolver ipResolver;
    private final SecurityStore store;

    public HandshakeController(CryptoService crypto, SecurityProperties props, ClientIpResolver ipResolver, SecurityStore store) {
        this.crypto = crypto;
        this.props = props;
        this.ipResolver = ipResolver;
        this.store = store;
    }

    @PostMapping("/handshake")
    public ResponseEntity<HandshakeResponse> handshake(
            @Valid @RequestBody HandshakeRequest body,
            HttpServletRequest request
    ) {
        if (props.isTlsRequired() && !ipResolver.isSecure(request)) {
            throw CryptoService.security(403, "SECURITY_TLS_REQUIRED", "HTTPS is required.");
        }
        String origin = request.getHeader("Origin");
        if (origin != null && !props.getAllowedOrigins().contains(origin)) {
            throw CryptoService.security(403, "SECURITY_ORIGIN_REJECTED", "Origin is not permitted.");
        }
        String userAgent = request.getHeader("User-Agent");
        if (userAgent == null || userAgent.isBlank()) {
            throw CryptoService.security(403, "SECURITY_CLIENT_REJECTED", "Client signature rejected.");
        }
        String lowerUa = userAgent.toLowerCase(Locale.ROOT);
        for (String token : props.getBlockedUserAgentTokens()) {
            if (!token.isBlank() && lowerUa.contains(token.toLowerCase(Locale.ROOT))) {
                throw CryptoService.security(403, "SECURITY_CLIENT_REJECTED", "Automated access is not permitted.");
            }
        }
        String ip = ipResolver.resolve(request);
        String ipHash = crypto.hashBinding(ipResolver.bindingKey(ip));
        long hits = store.hit("handshake:" + ipHash, Duration.ofMinutes(1));
        if (hits > props.getHandshakesPerMinutePerIp()) {
            throw new ApiSecurityException(429, "SECURITY_RATE_LIMIT", "Too many secure-channel handshakes.", "60");
        }
        HandshakeResponse response = crypto.handshake(body, ip, userAgent);
        return ResponseEntity.status(HttpStatus.CREATED)
                .header("Cache-Control", "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .body(response);
    }

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of(
                "status", "ok",
                "channel", "required",
                "cipher", "P-256/ECDH+HKDF-SHA256+AES-256-GCM"
        );
    }
}
