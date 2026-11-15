package com.laorvia.api.security;

import com.laorvia.api.security.SecurityDtos.HandshakeRequest;
import com.laorvia.api.security.SecurityDtos.HandshakeResponse;
import com.laorvia.api.security.SecurityDtos.SecureEnvelope;
import com.laorvia.api.security.SecurityStore.StoredChannel;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.AlgorithmParameterSpec;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import static com.laorvia.api.security.KeyVault.b64u;
import static com.laorvia.api.security.KeyVault.b64uDecode;
import static com.laorvia.api.security.KeyVault.sha256;

/**
 * Laorvia secure channel (LAV1).
 *
 *   ECDH P-256  →  HKDF-SHA256  →  AES-256-GCM (requests & responses)
 *                              →  HMAC-SHA256 (request authentication)
 *
 *  - Channel keys are ephemeral per handshake and never stored outside Redis,
 *    wrapped with the KeyVault KEK. The ECDH private key is discarded immediately,
 *    giving forward secrecy for recorded traffic.
 *  - Every request carries a timestamp, a single-use nonce and an HMAC over the
 *    method, path, ciphertexts and headers, so requests cannot be replayed,
 *    reordered or tampered with.
 *  - Responses are encrypted with a distinct key and an AAD bound to the request
 *    nonce and HTTP status, so a response cannot be replayed into another call.
 */
@Service
public class CryptoService {

    private static final String SALT_LABEL = "LAV1-SALT:";
    private static final String INFO_REQ = "LAV1-REQ";
    private static final String INFO_RES = "LAV1-RES";
    private static final String INFO_AUTH = "LAV1-AUTH";
    private static final String AAD_REQ = "LAV1-AAD\n";
    private static final String AAD_RES = "LAV1-RES\n";
    private static final String SIG_LABEL = "LAV1-SIG\n";
    private static final String CONFIRM_LABEL = "LAV1-CONFIRM\n";
    private static final String CIPHER_SUITE = "P-256/ECDH+HKDF-SHA256+AES-256-GCM/HMAC-SHA256";

    private static final Base64.Encoder B64E = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    public record OpenedRequest(byte[] body, String queryString, String targetPath, StoredChannel channel) {}

    public record DecryptedKeys(byte[] requestKey, byte[] responseKey, byte[] authKey) {}

    private final SecurityStore store;
    private final SecurityProperties props;
    private final ClientIpResolver ipResolver;
    private final JsonMapper json;

    public CryptoService(SecurityStore store, SecurityProperties props, ClientIpResolver ipResolver, JsonMapper json) {
        this.store = store;
        this.props = props;
        this.ipResolver = ipResolver;
        this.json = json;
    }

    /* ───────────────────────── handshake ───────────────────────── */

    public HandshakeResponse handshake(HandshakeRequest req, String ip, String userAgent) {
        try {
            byte[] clientPubRaw = B64D.decode(req.clientPublicKey());
            byte[] clientNonce = B64D.decode(req.clientNonce());
            if (clientPubRaw.length != 65 || clientPubRaw[0] != 0x04) {
                throw security(400, "SECURITY_HANDSHAKE_INVALID", "Malformed client public key.");
            }
            if (clientNonce.length < 16 || clientNonce.length > 64) {
                throw security(400, "SECURITY_HANDSHAKE_INVALID", "Malformed client nonce.");
            }

            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"), new SecureRandom());
            KeyPair serverPair = generator.generateKeyPair();

            byte[] serverPubRaw = encodePublicKey(serverPair.getPublic());
            byte[] serverNonce = new byte[32];
            new SecureRandom().nextBytes(serverNonce);

            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init(serverPair.getPrivate());
            agreement.doPhase(decodePublicKey(clientPubRaw), true);
            byte[] shared = agreement.generateSecret();

            byte[] saltInput = concat(
                    SALT_LABEL.getBytes(StandardCharsets.UTF_8),
                    clientNonce,
                    serverNonce,
                    clientPubRaw,
                    serverPubRaw
            );
            byte[] salt = sha256(saltInput);
            byte[] requestKey = hkdf(shared, salt, INFO_REQ.getBytes(StandardCharsets.UTF_8), 32);
            byte[] responseKey = hkdf(shared, salt, INFO_RES.getBytes(StandardCharsets.UTF_8), 32);
            byte[] authKey = hkdf(shared, salt, INFO_AUTH.getBytes(StandardCharsets.UTF_8), 32);

            String keyId = "k1_" + UUID.randomUUID().toString().replace("-", "");
            long now = System.currentTimeMillis();
            long expiresAt = now + Duration.ofSeconds(props.getKeyTtlSeconds()).toMillis();

            String deviceHash = hashBinding(req.deviceId());
            String ipHash = hashBinding(ipResolver.bindingKey(ip));
            String uaHash = hashBinding(userAgent == null ? "" : userAgent);
            String guestToken = (req.guestToken() == null || req.guestToken().isBlank()) ? null : req.guestToken().trim();

            StoredChannel channel = new StoredChannel(
                    keyId,
                    b64u(requestKey),
                    b64u(responseKey),
                    b64u(authKey),
                    deviceHash,
                    ipHash,
                    uaHash,
                    guestToken,
                    now,
                    expiresAt
            );
            store.saveChannel(channel, Duration.ofSeconds(props.getKeyTtlSeconds() + 30));

            String confirmation = b64u(hmac(authKey, (CONFIRM_LABEL
                    + req.clientNonce() + "\n"
                    + b64u(serverNonce) + "\n"
                    + keyId).getBytes(StandardCharsets.UTF_8)));

            // Discard the private key material with this stack frame (forward secrecy).
            return new HandshakeResponse(
                    keyId,
                    b64u(serverPubRaw),
                    b64u(serverNonce),
                    props.getKeyTtlSeconds(),
                    confirmation,
                    CIPHER_SUITE,
                    props.getIpBindingMode()
            );
        } catch (ApiSecurityException e) {
            throw e;
        } catch (Exception e) {
            throw security(400, "SECURITY_HANDSHAKE_FAILED", "Unable to establish a secure channel.");
        }
    }

    /* ───────────────────────── request opening ───────────────────────── */

    public OpenedRequest open(
            String method,
            String path,
            String keyId,
            String timestampRaw,
            String nonce,
            String authHeader,
            String encryptedQuery,
            byte[] rawBody,
            String ip,
            String userAgent,
            String deviceId
    ) {
        return open(method, path, keyId, timestampRaw, nonce, authHeader, encryptedQuery, null, rawBody, ip, userAgent, deviceId);
    }

    public OpenedRequest open(
            String method,
            String path,
            String keyId,
            String timestampRaw,
            String nonce,
            String authHeader,
            String encryptedQuery,
            String encryptedTarget,
            byte[] rawBody,
            String ip,
            String userAgent,
            String deviceId
    ) {
        if (keyId == null || timestampRaw == null || nonce == null || authHeader == null) {
            throw security(401, "SECURITY_HEADERS_MISSING", "This endpoint requires an encrypted channel.");
        }
        if (nonce.length() < 16 || nonce.length() > 128) {
            throw security(400, "SECURITY_NONCE_INVALID", "Invalid request nonce.");
        }

        long timestamp;
        try {
            timestamp = Long.parseLong(timestampRaw);
        } catch (NumberFormatException e) {
            throw security(400, "SECURITY_TIMESTAMP_INVALID", "Invalid request timestamp.");
        }
        long skew = Math.abs(System.currentTimeMillis() / 1000L - timestamp);
        if (skew > props.getClockSkewSeconds()) {
            throw security(401, "SECURITY_TIMESTAMP_EXPIRED", "Request expired. The client clock may be out of sync.");
        }

        StoredChannel channel = store.loadChannel(keyId)
                .orElseThrow(() -> security(401, "SECURITY_KEY_UNKNOWN", "Secure channel not found. Reconnect."));

        if (channel.expiresAt() < System.currentTimeMillis()) {
            store.deleteChannel(keyId);
            throw security(401, "SECURITY_KEY_EXPIRED", "Secure channel expired. Reconnect.");
        }

        // Cryptographic binding: device, user-agent and client IP (or subnet) must match the channel.
        if (!constantEquals(channel.deviceHash(), hashBinding(deviceId == null ? "" : deviceId))) {
            throw bindingFailure(keyId, "SECURITY_DEVICE_MISMATCH");
        }
        if (!constantEquals(channel.userAgentHash(), hashBinding(userAgent == null ? "" : userAgent))) {
            throw bindingFailure(keyId, "SECURITY_CLIENT_MISMATCH");
        }
        if (!constantEquals(channel.ipHash(), hashBinding(ipResolver.bindingKey(ip)))) {
            throw bindingFailure(keyId, "SECURITY_IP_MISMATCH");
        }

        byte[] requestKey = b64uDecode(channel.requestKey());
        byte[] responseKey = b64uDecode(channel.responseKey());
        byte[] authKey = b64uDecode(channel.authKey());

        byte[] bodyCipher = rawBody == null ? new byte[0] : rawBody;
        byte[] queryCipher = encryptedQuery == null ? new byte[0] : encryptedQuery.getBytes(StandardCharsets.UTF_8);
        byte[] targetCipher = (encryptedTarget == null || encryptedTarget.isBlank())
                ? new byte[0]
                : encryptedTarget.trim().getBytes(StandardCharsets.UTF_8);

        String canonical = SIG_LABEL
                + method.toUpperCase() + "\n"
                + path + "\n"
                + keyId + "\n"
                + timestampRaw + "\n"
                + nonce + "\n"
                + b64u(sha256(bodyCipher)) + "\n"
                + b64u(sha256(queryCipher))
                + (targetCipher.length > 0 ? "\n" + b64u(sha256(targetCipher)) : "");

        byte[] expected;
        try {
            expected = hmac(authKey, canonical.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw security(500, "SECURITY_INTERNAL", "Unable to verify request.");
        }
        byte[] supplied;
        try {
            supplied = B64D.decode(authHeader);
        } catch (RuntimeException e) {
            throw security(401, "SECURITY_SIGNATURE_INVALID", "Request signature rejected.");
        }
        if (!MessageDigest.isEqual(expected, supplied)) {
            throw security(401, "SECURITY_SIGNATURE_INVALID", "Request signature rejected.");
        }

        if (!store.consumeNonce(keyId, nonce, Duration.ofSeconds(props.getClockSkewSeconds() * 2L + 1L))) {
            throw security(409, "SECURITY_REPLAY_DETECTED", "Duplicate request rejected.");
        }

        String aad = AAD_REQ + keyId + "\n" + timestampRaw + "\n" + nonce;
        byte[] body = bodyCipher.length == 0
                ? new byte[0]
                : decryptEnvelope(requestKey, new String(bodyCipher, StandardCharsets.UTF_8), aad);
        String query = queryCipher.length == 0
                ? null
                : new String(decryptEnvelope(requestKey, new String(queryCipher, StandardCharsets.UTF_8), aad), StandardCharsets.UTF_8);
        String targetPath = targetCipher.length == 0
                ? null
                : new String(decryptEnvelope(requestKey, new String(targetCipher, StandardCharsets.UTF_8), aad), StandardCharsets.UTF_8);

        return new OpenedRequest(body, query, targetPath, channel);
    }

    /* ───────────────────────── responses ───────────────────────── */

    public byte[] encryptResponse(StoredChannel channel, String requestNonce, int status, byte[] plaintext) {
        try {
            byte[] responseKey = b64uDecode(channel.responseKey());
            String aad = AAD_RES + channel.keyId() + "\n" + requestNonce + "\n" + status;
            byte[] iv = new byte[12];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(responseKey, "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            byte[] ct = cipher.doFinal(plaintext);
            SecureEnvelope envelope = new SecureEnvelope(1, b64u(iv), b64u(ct));
            return json.writeValueAsString(envelope).getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw security(500, "SECURITY_ENCRYPTION_FAILED", "Unable to secure the response.");
        }
    }

    /* ───────────────────────── helpers ───────────────────────── */

    public String hashBinding(String value) {
        String pepper = props.getIpPepper() == null ? "" : props.getIpPepper();
        return b64u(sha256((value + "|" + pepper).getBytes(StandardCharsets.UTF_8)));
    }

    public static boolean constantEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    public static ApiSecurityException security(int status, String code, String message) {
        return new ApiSecurityException(status, code, message);
    }

    private ApiSecurityException bindingFailure(String keyId, String code) {
        store.deleteChannel(keyId);
        return security(403, code, "This session is locked to its original device and network. Please reconnect.");
    }

    /** Parses the transmitted `{v, iv, ct}` envelope, then AES-GCM-verifies it. */
    private byte[] decryptEnvelope(byte[] key, String envelopeJson, String aad) {
        try {
            SecureEnvelope envelope = json.readValue(envelopeJson, SecureEnvelope.class);
            if (envelope == null || envelope.v() != 1) {
                throw security(400, "SECURITY_DECRYPT_FAILED", "Encrypted payload could not be verified.");
            }
            byte[] iv = Base64.getUrlDecoder().decode(envelope.iv());
            byte[] ct = Base64.getUrlDecoder().decode(envelope.ct());
            if (iv.length != 12 || ct.length < 17) {
                throw security(400, "SECURITY_DECRYPT_FAILED", "Encrypted payload could not be verified.");
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad.getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(ct);
        } catch (ApiSecurityException e) {
            throw e;
        } catch (Exception e) {
            throw security(400, "SECURITY_DECRYPT_FAILED", "Encrypted payload could not be verified.");
        }
    }

    private static byte[] hmac(byte[] key, byte[] input) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(input);
    }

    /** RFC 5869 HKDF-SHA256 (extract + expand). */
    static byte[] hkdf(byte[] ikm, byte[] salt, byte[] info, int length) throws Exception {
        byte[] effectiveSalt = (salt == null || salt.length == 0) ? new byte[32] : salt;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(effectiveSalt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);

        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        byte[] okm = new byte[length];
        byte[] previous = new byte[0];
        int offset = 0;
        int counter = 1;
        while (offset < length) {
            mac.reset();
            mac.update(previous);
            mac.update(info);
            mac.update((byte) counter);
            previous = mac.doFinal();
            int copy = Math.min(previous.length, length - offset);
            System.arraycopy(previous, 0, okm, offset, copy);
            offset += copy;
            counter++;
        }
        return okm;
    }

    private static byte[] encodePublicKey(PublicKey publicKey) {
        java.security.interfaces.ECPublicKey ec = (java.security.interfaces.ECPublicKey) publicKey;
        byte[] x = fixed(ec.getW().getAffineX(), 32);
        byte[] y = fixed(ec.getW().getAffineY(), 32);
        byte[] raw = new byte[65];
        raw[0] = 0x04;
        System.arraycopy(x, 0, raw, 1, 32);
        System.arraycopy(y, 0, raw, 33, 32);
        return raw;
    }

    private static PublicKey decodePublicKey(byte[] raw) throws Exception {
        AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec spec = parameters.getParameterSpec(ECParameterSpec.class);
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(raw, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(raw, 33, 65));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), spec));
    }

    private static byte[] fixed(BigInteger value, int size) {
        byte[] bytes = value.toByteArray();
        byte[] out = new byte[size];
        if (bytes.length > size) {
            System.arraycopy(bytes, bytes.length - size, out, 0, size);
        } else {
            System.arraycopy(bytes, 0, out, size - bytes.length, bytes.length);
        }
        return out;
    }

    private static byte[] concat(byte[]... arrays) {
        int total = 0;
        for (byte[] a : arrays) total += a.length;
        byte[] out = new byte[total];
        int offset = 0;
        for (byte[] a : arrays) {
            System.arraycopy(a, 0, out, offset, a.length);
            offset += a.length;
        }
        return out;
    }

    public static byte[] b64uDecodeStatic(String value) {
        return B64D.decode(value);
    }

    public static String b64uStatic(byte[] value) {
        return B64E.encodeToString(value);
    }

    public static String sha256Hex(String value) {
        byte[] digest = sha256(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder(digest.length * 2);
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    public static Optional<String> blankToNull(String value) {
        return (value == null || value.isBlank()) ? Optional.empty() : Optional.of(value.trim());
    }
}
