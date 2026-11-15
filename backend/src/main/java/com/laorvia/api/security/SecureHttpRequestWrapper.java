package com.laorvia.api.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Replaces the wire body/query with the decrypted plaintext for the controller layer. */
public class SecureHttpRequestWrapper extends HttpServletRequestWrapper {

    private final byte[] body;
    private final String queryString;
    private final Map<String, String[]> parameters;
    private final String overridePath;

    public SecureHttpRequestWrapper(HttpServletRequest request, byte[] decryptedBody, String decryptedQuery) {
        this(request, decryptedBody, decryptedQuery, null);
    }

    public SecureHttpRequestWrapper(HttpServletRequest request, byte[] decryptedBody, String decryptedQuery, String overridePath) {
        super(request);
        this.body = decryptedBody == null ? new byte[0] : decryptedBody;
        this.queryString = decryptedQuery;
        this.parameters = parseQuery(decryptedQuery);
        this.overridePath = overridePath;
    }

    private static Map<String, String[]> parseQuery(String query) {
        Map<String, List<String>> temp = new LinkedHashMap<>();
        if (query != null && !query.isBlank()) {
            for (String pair : query.split("&")) {
                if (pair.isBlank()) continue;
                int eq = pair.indexOf('=');
                String rawKey = eq >= 0 ? pair.substring(0, eq) : pair;
                String rawValue = eq >= 0 ? pair.substring(eq + 1) : "";
                String key = URLDecoder.decode(rawKey, StandardCharsets.UTF_8);
                String value = URLDecoder.decode(rawValue, StandardCharsets.UTF_8);
                if (key.length() > 128 || value.length() > 512) {
                    throw new ApiSecurityException(400, "SECURITY_QUERY_INVALID", "Query parameter rejected.");
                }
                temp.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
            }
        }
        Map<String, String[]> out = new LinkedHashMap<>();
        temp.forEach((k, v) -> out.put(k, v.toArray(String[]::new)));
        return Collections.unmodifiableMap(out);
    }

    @Override public String getQueryString() { return queryString; }
    @Override public String getRequestURI() { return overridePath != null ? overridePath : super.getRequestURI(); }
    @Override public String getServletPath() { return overridePath != null ? overridePath : super.getServletPath(); }
    @Override public String getParameter(String name) { String[] v = parameters.get(name); return v == null || v.length == 0 ? null : v[0]; }
    @Override public Map<String, String[]> getParameterMap() { return parameters; }
    @Override public Enumeration<String> getParameterNames() { return Collections.enumeration(parameters.keySet()); }
    @Override public String[] getParameterValues(String name) { return parameters.get(name); }

    @Override public int getContentLength() { return body.length; }
    @Override public long getContentLengthLong() { return body.length; }

    @Override public jakarta.servlet.ServletInputStream getInputStream() {
        ByteArrayInputStream in = new ByteArrayInputStream(body);
        return new jakarta.servlet.ServletInputStream() {
            @Override public int read() { return in.read(); }
            @Override public int read(byte[] b, int off, int len) { return in.read(b, off, len); }
            @Override public boolean isFinished() { return in.available() == 0; }
            @Override public boolean isReady() { return true; }
            @Override public void setReadListener(jakarta.servlet.ReadListener listener) { /* synchronous body */ }
        };
    }

    @Override public BufferedReader getReader() {
        return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
    }
}
