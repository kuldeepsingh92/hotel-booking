package com.laorvia.api;

import com.laorvia.api.service.AuthService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LaorviaApiApplicationTests {

    @Test
    void passwordsUseSaltedPbkdf2AndVerifyInConstantTime() {
        String hash = AuthService.hashPassword("laorvia2026");
        assertThat(hash).startsWith("pbkdf2-sha256$310000$");
        assertThat(AuthService.verifyPassword("laorvia2026", hash)).isTrue();
        assertThat(AuthService.verifyPassword("other", hash)).isFalse();
    }
}
