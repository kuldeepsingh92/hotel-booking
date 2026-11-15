package com.laorvia.api.security;

/** Security failures that must be answered with a minimal, non-data-bearing error. */
public class ApiSecurityException extends RuntimeException {

    private final int status;
    private final String code;
    private final String retryAfterSeconds;

    public ApiSecurityException(int status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiSecurityException(int status, String code, String message, String retryAfterSeconds) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public int status() { return status; }
    public String code() { return code; }
    public String retryAfterSeconds() { return retryAfterSeconds; }
}
