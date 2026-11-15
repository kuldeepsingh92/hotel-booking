package com.laorvia.api.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * Resolves the real client IP without blindly trusting X-Forwarded-For.
 * X-Forwarded-* is honoured ONLY when trustedProxyCount > 0, taking the
 * right-most untrusted hop. Network ACLs must ensure only the load balancer
 * can reach the application port.
 */
@Component
public class ClientIpResolver {

    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3}\\.){3}\\d{1,3}$");
    private static final Pattern IPV6 = Pattern.compile("^[0-9a-fA-F:.]{2,45}$");

    private final SecurityProperties props;

    public ClientIpResolver(SecurityProperties props) {
        this.props = props;
    }

    public String resolve(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        int trusted = props.getTrustedProxyCount();
        if (trusted <= 0) {
            return safe(remote);
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded == null || forwarded.isBlank()) {
            return safe(remote);
        }
        String[] hops = forwarded.split(",");
        for (String hop : hops) {
            String trimmed = hop.trim();
            if (!trimmed.isEmpty() && !isValid(trimmed)) {
                return safe(remote);
            }
        }
        int index = Math.max(0, hops.length - trusted);
        return safe(hops[index].trim());
    }

    public boolean isSecure(HttpServletRequest request) {
        if (request.isSecure()) return true;
        if (props.getTrustedProxyCount() <= 0) return false;
        String proto = request.getHeader("X-Forwarded-Proto");
        return proto != null && proto.trim().equalsIgnoreCase("https");
    }

    /** Full IP for STRICT binding, or a network key for SUBNET binding. */
    public String bindingKey(String ip) {
        if ("SUBNET".equalsIgnoreCase(props.getIpBindingMode())) {
            return subnet(ip);
        }
        return ip;
    }

    private String subnet(String ip) {
        if (IPV4.matcher(ip).matches()) {
            int idx = ip.lastIndexOf('.');
            return ip.substring(0, Math.max(0, idx)) + ".0/24";
        }
        String[] parts = ip.split(":");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(4, parts.length); i++) {
            if (i > 0) sb.append(':');
            sb.append(parts[i]);
        }
        return sb + "::/64";
    }

    private boolean isValid(String candidate) {
        return IPV4.matcher(candidate).matches() || IPV6.matcher(candidate).matches();
    }

    private String safe(String ip) {
        return (ip == null || ip.isBlank()) ? "0.0.0.0" : ip.trim().toLowerCase();
    }
}
