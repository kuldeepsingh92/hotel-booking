package com.laorvia.api.security;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * Holds the Key Encryption Key (KEK) used to wrap per-session channel keys in Redis.
 * A Redis dump alone is useless without this key, which lives in the environment /
 * a KMS or HSM and never in the repository or the database.
 */
@Component
public class KeyVault {

    private static final Logger log = LoggerFactory.getLogger(KeyVault.class);
    private static final SecureRandom RNG = new SecureRandom();
    private static final Base64.Encoder B64E = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    private final SecurityProperties props;
    private byte[] kek;

    public KeyVault(SecurityProperties props) {
        this.props = props;
    }

    @PostConstruct
    void init() {
        String configured = props.getKek();
        if (configured != null && !configured.isBlank()) {
            byte[] decoded = B64D.decode(configured.trim());
            if (decoded.length != 32) {
                throw new IllegalStateException("LAORVIA_SECURITY_KEK must decode to exactly 32 bytes");
            }
            this.kek = decoded;
            log.info("Security: master KEK loaded from environment ({} bits)", decoded.length * 8);
        } else if (props.isAllowEphemeralKek()) {
            this.kek = new byte[32];
            RNG.nextBytes(this.kek);
            log.warn("Security: EPHEMERAL KEK generated. Redis-wrapped channel keys will be unreadable after restart. NEVER use this mode in production.");
        } else {
            throw new IllegalStateException(
                    "LAORVIA_SECURITY_KEK is mandatory. Generate one with: openssl rand -base64 32");
        }

        String pepper = props.getIpPepper();
        if (pepper == null || pepper.length() < 16) {
            if (props.isAllowEphemeralKek()) {
                log.warn("Security: LAORVIA_SECURITY_IP_PEPPER missing/too short. Binding hashes use a weak pepper in this dev-only mode.");
            } else {
                throw new IllegalStateException("LAORVIA_SECURITY_IP_PEPPER must be at least 16 characters (store in a secret manager).");
            }
        }
    }

    /** Wraps plaintext with AES-256-GCM. AAD binds the ciphertext to the key id. */
    public String wrap(String keyId, String plaintext) {
        try {
            byte[] iv = new byte[12];
            RNG.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(kek, "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(("KEK1|" + keyId).getBytes(StandardCharsets.UTF_8));
            byte[] ct = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ct, 0, combined, iv.length, ct.length);
            return B64E.encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to wrap channel key", e);
        }
    }

    public String unwrap(String keyId, String wrapped) {
        try {
            byte[] combined = B64D.decode(wrapped);
            byte[] iv = Arrays.copyOfRange(combined, 0, 12);
            byte[] ct = Arrays.copyOfRange(combined, 12, combined.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(kek, "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(("KEK1|" + keyId).getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to unwrap channel key", e);
        }
    }

    public static byte[] sha256(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public static String b64u(byte[] bytes) {
        return B64E.encodeToString(bytes);
    }

    public static byte[] b64uDecode(String value) {
        return B64D.decode(value);
    }
}
