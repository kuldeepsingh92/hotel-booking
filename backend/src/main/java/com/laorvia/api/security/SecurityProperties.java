package com.laorvia.api.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * All tunables for the Laorvia secure channel and request guard.
 * Secrets (KEK, IP pepper) are supplied only via environment / secret manager.
 */
@Component
@ConfigurationProperties(prefix = "laorvia.security")
public class SecurityProperties {

    /** Base64 32-byte Key Encryption Key that wraps per-session channel keys at rest in Redis. */
    private String kek = "";

    /** Server-side pepper mixed into every IP / device / user-agent hash. */
    private String ipPepper = "";

    /** Dev-only escape hatch. Production MUST keep this false. */
    private boolean allowEphemeralKek = false;

    /** Number of trusted reverse proxies in front of the app. 0 = ignore X-Forwarded-* entirely. */
    private int trustedProxyCount = 0;

    /** Reject any non-TLS traffic. Production MUST keep this true. */
    private boolean tlsRequired = true;

    /** STRICT binds the channel to the full IP. SUBNET tolerates IPv4 /24 and IPv6 /64 changes. */
    private String ipBindingMode = "STRICT";

    /** Lifetime of a derived channel. Client re-handshakes transparently. */
    private int keyTtlSeconds = 1800;

    /** Maximum accepted clock difference for X-LAV-TS. */
    private int clockSkewSeconds = 60;

    private int maxBodyBytes = 262_144;

    private int requestsPerMinutePerIp = 240;
    private int requestsPerMinutePerKey = 600;
    private int handshakesPerMinutePerIp = 30;
    private int bootstrapPerMinutePerIp = 12;
    private int authPerMinutePerIp = 20;

    /** Demo account endpoint. MUST be false in production. */
    private boolean demoLoginEnabled = false;

    private int loginMaxFailures = 5;
    private int loginLockMinutes = 15;

    private List<String> allowedOrigins = new ArrayList<>(List.of(
            "https://laorvia.com",
            "https://www.laorvia.com",
            "http://localhost:5173",
            "http://localhost:4173"
    ));

    /** Block obvious scrapers. Requests with no User-Agent are refused for authenticated API use. */
    private List<String> blockedUserAgentTokens = new ArrayList<>(List.of(
            "curl/", "wget/", "python-requests", "python-urllib", "scrapy", "httpclient",
            "axios/", "go-http-client", "java/", "okhttp", "headlesschrome", "phantomjs", "bot"
    ));

    public String getKek() { return kek; }
    public void setKek(String kek) { this.kek = kek; }

    public String getIpPepper() { return ipPepper; }
    public void setIpPepper(String ipPepper) { this.ipPepper = ipPepper; }

    public boolean isAllowEphemeralKek() { return allowEphemeralKek; }
    public void setAllowEphemeralKek(boolean allowEphemeralKek) { this.allowEphemeralKek = allowEphemeralKek; }

    public int getTrustedProxyCount() { return trustedProxyCount; }
    public void setTrustedProxyCount(int trustedProxyCount) { this.trustedProxyCount = trustedProxyCount; }

    public boolean isTlsRequired() { return tlsRequired; }
    public void setTlsRequired(boolean tlsRequired) { this.tlsRequired = tlsRequired; }

    public String getIpBindingMode() { return ipBindingMode; }
    public void setIpBindingMode(String ipBindingMode) { this.ipBindingMode = ipBindingMode; }

    public int getKeyTtlSeconds() { return keyTtlSeconds; }
    public void setKeyTtlSeconds(int keyTtlSeconds) { this.keyTtlSeconds = keyTtlSeconds; }

    public int getClockSkewSeconds() { return clockSkewSeconds; }
    public void setClockSkewSeconds(int clockSkewSeconds) { this.clockSkewSeconds = clockSkewSeconds; }

    public int getMaxBodyBytes() { return maxBodyBytes; }
    public void setMaxBodyBytes(int maxBodyBytes) { this.maxBodyBytes = maxBodyBytes; }

    public int getRequestsPerMinutePerIp() { return requestsPerMinutePerIp; }
    public void setRequestsPerMinutePerIp(int requestsPerMinutePerIp) { this.requestsPerMinutePerIp = requestsPerMinutePerIp; }

    public int getRequestsPerMinutePerKey() { return requestsPerMinutePerKey; }
    public void setRequestsPerMinutePerKey(int requestsPerMinutePerKey) { this.requestsPerMinutePerKey = requestsPerMinutePerKey; }

    public int getHandshakesPerMinutePerIp() { return handshakesPerMinutePerIp; }
    public void setHandshakesPerMinutePerIp(int handshakesPerMinutePerIp) { this.handshakesPerMinutePerIp = handshakesPerMinutePerIp; }

    public int getBootstrapPerMinutePerIp() { return bootstrapPerMinutePerIp; }
    public void setBootstrapPerMinutePerIp(int bootstrapPerMinutePerIp) { this.bootstrapPerMinutePerIp = bootstrapPerMinutePerIp; }

    public int getAuthPerMinutePerIp() { return authPerMinutePerIp; }
    public void setAuthPerMinutePerIp(int authPerMinutePerIp) { this.authPerMinutePerIp = authPerMinutePerIp; }

    public boolean isDemoLoginEnabled() { return demoLoginEnabled; }
    public void setDemoLoginEnabled(boolean demoLoginEnabled) { this.demoLoginEnabled = demoLoginEnabled; }

    public int getLoginMaxFailures() { return loginMaxFailures; }
    public void setLoginMaxFailures(int loginMaxFailures) { this.loginMaxFailures = loginMaxFailures; }

    public int getLoginLockMinutes() { return loginLockMinutes; }
    public void setLoginLockMinutes(int loginLockMinutes) { this.loginLockMinutes = loginLockMinutes; }

    public List<String> getAllowedOrigins() { return allowedOrigins; }
    public void setAllowedOrigins(List<String> allowedOrigins) { this.allowedOrigins = allowedOrigins; }

    public List<String> getBlockedUserAgentTokens() { return blockedUserAgentTokens; }
    public void setBlockedUserAgentTokens(List<String> blockedUserAgentTokens) { this.blockedUserAgentTokens = blockedUserAgentTokens; }
}
