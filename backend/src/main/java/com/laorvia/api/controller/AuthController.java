package com.laorvia.api.controller;

import com.laorvia.api.model.Models.*;
import com.laorvia.api.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * Customer identity is resolved exclusively from the server-bound secure channel
 * (SecureApiFilter → RequestContext). No controller trusts a client-supplied user ID.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse signUp(@Valid @RequestBody SignUpRequest req) {
        return auth.signUp(req);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return auth.signIn(req);
    }

    @PostMapping("/demo")
    public AuthResponse demoLogin() {
        return auth.signInDemo();
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout() {
        auth.logout();
    }

    @GetMapping("/me")
    public AuthResponse me() {
        return auth.me();
    }

    @PutMapping("/profile")
    public PublicUser updateProfile(@Valid @RequestBody ProfileUpdateRequest req) {
        return auth.updateProfile(req);
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        auth.changePassword(req);
    }

    @DeleteMapping("/account")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAccount() {
        auth.deleteAccount();
    }
}
