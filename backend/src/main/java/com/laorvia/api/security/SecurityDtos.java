package com.laorvia.api.security;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class SecurityDtos {

    private SecurityDtos() {}

    public record HandshakeRequest(
            @NotBlank @Size(max = 200) String clientPublicKey,
            @NotBlank @Size(max = 200) String clientNonce,
            @NotBlank @Size(max = 128) String deviceId,
            @Size(max = 256) String guestToken,
            @Size(max = 40) String appVersion
    ) {}

    public record HandshakeResponse(
            String keyId,
            String serverPublicKey,
            String serverNonce,
            int expiresInSeconds,
            String confirmation,
            String cipher,
            String ipBindingMode
    ) {}

    public record SecureEnvelope(
            int v,
            String iv,
            String ct
    ) {}
}
