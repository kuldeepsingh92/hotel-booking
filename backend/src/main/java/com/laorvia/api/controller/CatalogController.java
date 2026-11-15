package com.laorvia.api.controller;

import com.laorvia.api.model.Models.*;
import com.laorvia.api.service.CatalogService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {

    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return catalog.getHealth();
    }

    @GetMapping("/bootstrap")
    public BootstrapResponse bootstrap() {
        return catalog.getBootstrap();
    }

    @GetMapping("/cities")
    public List<City> cities() {
        return catalog.getCities();
    }

    @GetMapping("/hotels")
    public List<Hotel> searchHotels(
            @RequestParam(required = false) String dest,
            @RequestParam(required = false) Integer minPrice,
            @RequestParam(required = false) Integer maxPrice,
            @RequestParam(required = false) Boolean freeCancel,
            @RequestParam(required = false) Boolean breakfast,
            @RequestParam(required = false) Double minRating,
            @RequestParam(required = false) List<Integer> stars,
            @RequestParam(required = false) List<String> types,
            @RequestParam(required = false) List<String> amenities,
            @RequestParam(required = false) String tag,
            @RequestParam(required = false, defaultValue = "recommended") String sort
    ) {
        return catalog.searchHotels(dest, minPrice, maxPrice, freeCancel, breakfast, minRating, stars, types, amenities, tag, sort);
    }

    @GetMapping("/hotels/{id}")
    public HotelDetailResponse hotelDetail(@PathVariable String id) {
        return catalog.getHotelDetail(id);
    }

    @GetMapping("/coupons")
    public List<Coupon> coupons() {
        return catalog.getCoupons();
    }

    @PostMapping("/coupons/evaluate")
    public CouponEvaluateResponse evaluateCoupon(@Valid @RequestBody CouponEvaluateRequest req) {
        return catalog.evaluateCoupon(req);
    }

    @GetMapping("/addons")
    public List<Addon> addons() {
        return catalog.getAddons();
    }

    @GetMapping("/home")
    public HomeContent home() {
        return catalog.getHomeContent();
    }

    @GetMapping("/blogs")
    public List<BlogArticle> blogs(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String q
    ) {
        return catalog.getBlogs(category, q);
    }

    @GetMapping("/blogs/{slug}")
    public BlogDetailResponse blogDetail(@PathVariable String slug) {
        return catalog.getBlogDetail(slug);
    }
}
