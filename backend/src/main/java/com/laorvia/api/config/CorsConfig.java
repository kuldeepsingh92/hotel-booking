package com.laorvia.api.config;

import com.laorvia.api.security.SecurityProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Strict origin allow-list. The frontend sends bearer material in headers,
 * never cookies, so credentials are deliberately disabled.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final SecurityProperties props;

    public CorsConfig(SecurityProperties props) {
        this.props = props;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(props.getAllowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders(
                        "Content-Type",
                        "X-LAV-Key", "X-LAV-TS", "X-LAV-Nonce", "X-LAV-Auth", "X-LAV-Query", "X-LAV-Device",
                        "X-Session-Token", "X-Guest-Token", "Idempotency-Key"
                )
                .exposedHeaders("X-Request-Id", "Retry-After")
                .allowCredentials(false)
                .maxAge(600);
    }
}
