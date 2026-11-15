package com.laorvia.api.controller;

import com.laorvia.api.service.BookingService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/saved")
public class SavedController {

    private final BookingService bookings;

    public SavedController(BookingService bookings) {
        this.bookings = bookings;
    }

    @GetMapping
    public List<String> list() {
        return bookings.getSaved();
    }

    @PostMapping("/{hotelId}")
    public List<String> add(@PathVariable String hotelId) {
        return bookings.addSaved(hotelId);
    }

    @DeleteMapping("/{hotelId}")
    public List<String> remove(@PathVariable String hotelId) {
        return bookings.removeSaved(hotelId);
    }
}
