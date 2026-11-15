package com.laorvia.api.security;

import com.laorvia.api.service.AuthService;
import org.junit.jupiter.api.Test;

import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class CryptoServiceTest {

    /** RFC 5869, Appendix A, Test Case 1 (HKDF-SHA256). */
    @Test
    void hkdfMatchesRfc5869TestCaseOne() throws Exception {
        byte[] ikm = HexFormat.of().parseHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
        byte[] salt = HexFormat.of().parseHex("000102030405060708090a0b0c");
        byte[] info = HexFormat.of().parseHex("f0f1f2f3f4f5f6f7f8f9");
        byte[] okm = CryptoService.hkdf(ikm, salt, info, 42);
        assertThat(HexFormat.of().formatHex(okm))
                .isEqualTo("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
    }

    @Test
    void passwordHashesAreSaltedAndVerifiable() {
        String first = AuthService.hashPassword("CorrectHorseBatteryStaple!");
        String second = AuthService.hashPassword("CorrectHorseBatteryStaple!");
        assertThat(first).startsWith("pbkdf2-sha256$310000$");
        assertThat(first).isNotEqualTo(second); // unique salt
        assertThat(AuthService.verifyPassword("CorrectHorseBatteryStaple!", first)).isTrue();
        assertThat(AuthService.verifyPassword("wrong", first)).isFalse();
        assertThat(AuthService.verifyPassword("CorrectHorseBatteryStaple!", "legacy-sha256")).isFalse();
    }

    @Test
    void bindingHashesAreStableAndPeppered() {
        SecurityProperties props = new SecurityProperties();
        props.setIpPepper("a-very-long-test-pepper-value");
        KeyVault vault = new KeyVault(props);
        SecurityStore store = null; // not needed for hashing
        CryptoService crypto = new CryptoService(store, props, new ClientIpResolver(props), null);
        String a = crypto.hashBinding("203.0.113.7");
        String b = crypto.hashBinding("203.0.113.7");
        String c = crypto.hashBinding("203.0.113.8");
        assertThat(a).isEqualTo(b).isNotEqualTo(c);
    }

    @Test
    void openedRequestSupportsTargetPathObfuscation() {
        CryptoService.OpenedRequest req = new CryptoService.OpenedRequest(
                "hello".getBytes(), "tab=all", "/api/v1/bookings", null
        );
        assertThat(req.targetPath()).isEqualTo("/api/v1/bookings");
        assertThat(req.queryString()).isEqualTo("tab=all");
    }
}
