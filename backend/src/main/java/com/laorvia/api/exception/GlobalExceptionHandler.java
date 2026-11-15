package com.laorvia.api.exception;

import com.laorvia.api.model.Models.ApiError;
import com.laorvia.api.security.ApiSecurityException;
import com.laorvia.api.security.RequestContext;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * Never leaks stack traces, exception messages, Redis details or request bodies.
 * All responses are encrypted by SecureApiFilter before leaving the server.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiSecurityException.class)
    public ResponseEntity<ApiError> handleSecurity(ApiSecurityException ex) {
        return ResponseEntity.status(ex.status()).body(new ApiError(ex.status(), ex.code(), ex.getMessage()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> handleStatus(ResponseStatusException ex) {
        int status = ex.getStatusCode().value();
        String reason = ex.getReason() != null ? ex.getReason() : "Request could not be completed.";
        return ResponseEntity.status(ex.getStatusCode()).body(new ApiError(status, "REQUEST_REJECTED", reason));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, ConstraintViolationException.class})
    public ResponseEntity<ApiError> handleValidation(Exception ex) {
        String message = "Please check the submitted fields.";
        if (ex instanceof MethodArgumentNotValidException manv) {
            message = manv.getBindingResult().getFieldErrors().stream()
                    .findFirst()
                    .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                    .orElse(message);
        }
        return ResponseEntity.badRequest().body(new ApiError(400, "VALIDATION_ERROR", message));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(new ApiError(400, "MALFORMED_REQUEST", "The request could not be read."));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiError> handleStore(Exception ex) {
        log.error("Data store failure requestId={}", RequestContext.requestId());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ApiError(503, "STORE_UNAVAILABLE", "Service temporarily unavailable. Please retry."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleGeneric(Exception ex) {
        log.error("Unhandled failure requestId={} type={}", RequestContext.requestId(), ex.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError(500, "INTERNAL_ERROR", "Something went wrong. Please try again."));
    }
}
