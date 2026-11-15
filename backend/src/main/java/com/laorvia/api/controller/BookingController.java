package com.laorvia.api.controller;

import com.laorvia.api.model.Models.*;
import com.laorvia.api.service.BookingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * Ownership is enforced in BookingService from RequestContext (user ID / guest token),
 * never from a path or body identifier supplied by the caller.
 */
@RestController
@RequestMapping("/api/v1/bookings")
public class BookingController {

    private final BookingService bookings;

    public BookingController(BookingService bookings) {
        this.bookings = bookings;
    }

    @GetMapping
    public AccountBookingsResponse listMine() {
        return bookings.listForUser();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Booking create(@Valid @RequestBody CreateBookingRequest req) {
        return bookings.createBooking(req);
    }

    @GetMapping("/{ref}")
    public Booking getOne(@PathVariable String ref) {
        return bookings.getBooking(ref);
    }

    @PostMapping("/{ref}/pay")
    public PayBalanceResponse payBalance(@PathVariable String ref, @Valid @RequestBody PayBalanceRequest req) {
        return bookings.payBalance(ref, req);
    }

    @PostMapping("/{ref}/cancel")
    public CancelBookingResponse cancel(@PathVariable String ref) {
        return bookings.cancelBooking(ref);
    }

    @PostMapping("/{ref}/review")
    public Booking saveReview(@PathVariable String ref, @Valid @RequestBody SaveReviewRequest req) {
        return bookings.saveReview(ref, req);
    }

    @DeleteMapping("/{ref}/review")
    public Booking deleteReview(@PathVariable String ref) {
        return bookings.deleteReview(ref);
    }

    @GetMapping("/{ref}/messages")
    public ChatThread getMessages(@PathVariable String ref) {
        return bookings.getThread(ref);
    }

    @PostMapping("/{ref}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public ChatThread sendMessage(@PathVariable String ref, @Valid @RequestBody SendMessageRequest req) {
        return bookings.sendMessage(ref, req);
    }

    @PostMapping("/{ref}/messages/read")
    public ChatThread markRead(@PathVariable String ref) {
        return bookings.markThreadRead(ref);
    }
}
