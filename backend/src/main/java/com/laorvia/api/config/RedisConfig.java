package com.laorvia.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * Configures StringRedisTemplate so all Redis values are stored as clean,
 * human-readable UTF-8 JSON interoperable with scripts/seed-redis.mjs and redis-cli.
 * Spring Boot 4.1.2 auto-configures the Jackson 3 JsonMapper bean.
 */
@Configuration
public class RedisConfig {

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }
}
