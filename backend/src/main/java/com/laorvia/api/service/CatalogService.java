package com.laorvia.api.service;

import com.laorvia.api.model.Models.*;
import com.laorvia.api.repository.RedisStoreRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

@Service
public class CatalogService {

    private final RedisStoreRepository store;

    public CatalogService(RedisStoreRepository store) {
        this.store = store;
    }

    public HealthResponse getHealth() {
        long start = System.nanoTime();
        String pong = store.ping();
        long latencyMs = Math.max(1L, (System.nanoTime() - start) / 1_000_000L);
        Optional<SeedInfo> seedInfo = store.getSeedInfo();
        Map<String, Long> counts = store.getCounts();
        boolean seeded = counts.getOrDefault("hotels", 0L) > 0 && counts.getOrDefault("cities", 0L) > 0;
        return new HealthResponse(
                seeded ? "UP" : "UNSEEDED",
                "PONG".equalsIgnoreCase(pong) ? "CONNECTED" : String.valueOf(pong),
                latencyMs,
                seeded,
                seedInfo.orElse(null),
                counts
        );
    }

    public BootstrapResponse getBootstrap() {
        List<City> cities = store.getCities();
        List<Hotel> hotels = store.getAllHotels();
        if (cities.isEmpty() || hotels.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "Redis is connected but empty. Run `node scripts/seed-redis.mjs` to populate Laorvia data into Redis."
            );
        }
        return new BootstrapResponse(
                cities,
                hotels,
                store.getAllLandmarks(),
                store.getAllHosts(),
                store.getAllCoupons(),
                store.getAllAddons(),
                store.getAllBlogs(),
                store.getHomeContent(),
                store.getMeta().orElse(null),
                store.getSeedInfo().orElse(null)
        );
    }

    public List<City> getCities() {
        return store.getCities();
    }

    public List<Hotel> searchHotels(
            String dest,
            Integer minPrice,
            Integer maxPrice,
            Boolean freeCancel,
            Boolean breakfast,
            Double minRating,
            List<Integer> stars,
            List<String> types,
            List<String> amenities,
            String tag,
            String sort
    ) {
        List<Hotel> base = (dest == null || dest.isBlank())
                ? store.getAllHotels()
                : store.getHotelsByCity(dest.trim().toLowerCase(Locale.ROOT));

        List<Hotel> filtered = new ArrayList<>();
        for (Hotel h : base) {
            if (minPrice != null && h.price() < minPrice) continue;
            if (maxPrice != null && h.price() > maxPrice) continue;
            if (Boolean.TRUE.equals(freeCancel) && !h.flex()) continue;
            if (Boolean.TRUE.equals(breakfast) && !"included".equalsIgnoreCase(h.breakfast())) continue;
            if (minRating != null && h.rating() < minRating) continue;
            if (stars != null && !stars.isEmpty() && !stars.contains(h.stars())) continue;
            if (types != null && !types.isEmpty() && !types.contains(h.type())) continue;
            if (amenities != null && !amenities.isEmpty() && (h.amenities() == null || !h.amenities().containsAll(amenities))) {
                continue;
            }
            if (tag != null && !tag.isBlank() && !"all".equalsIgnoreCase(tag)) {
                if (h.tags() == null || !h.tags().contains(tag)) continue;
            }
            filtered.add(h);
        }

        String sortMode = (sort == null || sort.isBlank()) ? "recommended" : sort;
        Comparator<Hotel> comparator = switch (sortMode) {
            case "price-asc" -> Comparator.comparingInt(Hotel::price);
            case "price-desc" -> Comparator.comparingInt(Hotel::price).reversed();
            case "rating" -> Comparator.comparingDouble(Hotel::rating).reversed()
                    .thenComparing(Comparator.comparingInt(Hotel::reviews).reversed());
            case "distance" -> Comparator.comparingDouble(Hotel::distance);
            default -> Comparator.comparingDouble(this::recommendedScore).reversed();
        };
        filtered.sort(comparator);
        return filtered;
    }

    public HotelDetailResponse getHotelDetail(String hotelId) {
        Hotel hotel = store.getHotel(hotelId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stay not found: " + hotelId));
        City city = store.getCity(hotel.cityId())
                .orElseGet(() -> store.getCities().stream().findFirst().orElse(null));
        List<NearbyPlace> nearby = computeNearby(hotel, store.getLandmarks(hotel.cityId()));
        List<Hotel> similar = store.getHotelsByCity(hotel.cityId()).stream()
                .filter(h -> !h.id().equals(hotel.id()))
                .sorted(Comparator.comparingInt(h -> Math.abs(h.price() - hotel.price())))
                .limit(3)
                .toList();
        PropertyHost host = store.getHost(hotel.cityId())
                .orElse(new PropertyHost("Guest Relations Desk", "Property Team", "+91 22 4100 8800"));
        return new HotelDetailResponse(hotel, city, nearby, similar, host);
    }

    public List<Coupon> getCoupons() {
        return store.getAllCoupons();
    }

    public CouponEvaluateResponse evaluateCoupon(CouponEvaluateRequest req) {
        String code = req.code().trim().toUpperCase(Locale.ROOT);
        Optional<Coupon> opt = store.getCoupon(code);
        if (opt.isEmpty()) {
            return new CouponEvaluateResponse(
                    false, 0,
                    "We don't recognise \"" + code + "\". Codes are letters and numbers with no spaces — check for a typo.",
                    null
            );
        }
        Coupon c = opt.get();
        if (c.expired() != null && !c.expired().isBlank()) {
            return new CouponEvaluateResponse(false, 0, "This promo code expired on " + c.expired() + ".", c);
        }
        if (c.minNights() != null && req.nights() < c.minNights()) {
            int more = c.minNights() - req.nights();
            return new CouponEvaluateResponse(
                    false, 0,
                    "Add " + more + (more == 1 ? " more night" : " more nights") + " to use this offer.",
                    c
            );
        }
        if (c.minSpend() != null && req.roomTotal() < c.minSpend()) {
            int diff = c.minSpend() - req.roomTotal();
            return new CouponEvaluateResponse(
                    false, 0,
                    "Needs ₹" + formatInr(c.minSpend()) + " in room charges — your booking is ₹" + formatInr(diff) + " short.",
                    c
            );
        }
        if (Boolean.TRUE.equals(c.saturday()) && !includesSaturdayNight(req.checkIn(), req.checkOut())) {
            return new CouponEvaluateResponse(false, 0, "Valid for weekend stays that include a Saturday night.", c);
        }
        int raw = "percent".equalsIgnoreCase(c.kind())
                ? (int) Math.round((req.roomTotal() * c.value()) / 100.0)
                : c.value();
        int cap = c.cap() != null ? c.cap() : Integer.MAX_VALUE;
        int discount = Math.min(Math.min(raw, cap), req.roomTotal());
        return new CouponEvaluateResponse(true, discount, null, c);
    }

    public List<Addon> getAddons() {
        return store.getAllAddons();
    }

    public HomeContent getHomeContent() {
        return store.getHomeContent();
    }

    public List<BlogArticle> getBlogs(String category, String query) {
        List<BlogArticle> all = store.getAllBlogs();
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return all.stream().filter(b -> {
            boolean catOk = category == null || category.isBlank()
                    || "All Guides".equalsIgnoreCase(category)
                    || "all".equalsIgnoreCase(category)
                    || category.equalsIgnoreCase(b.category());
            boolean qOk = q.isEmpty()
                    || b.title().toLowerCase(Locale.ROOT).contains(q)
                    || b.subtitle().toLowerCase(Locale.ROOT).contains(q)
                    || (b.keywords() != null && b.keywords().stream().anyMatch(k -> k.toLowerCase(Locale.ROOT).contains(q)));
            return catOk && qOk;
        }).toList();
    }

    public BlogDetailResponse getBlogDetail(String slug) {
        BlogArticle blog = store.getBlog(slug)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Blog article not found: " + slug));
        List<Hotel> curatedHotels = blog.hotelIds() == null
                ? List.of()
                : blog.hotelIds().stream()
                        .map(store::getHotel)
                        .flatMap(Optional::stream)
                        .toList();
        List<BlogArticle> related = store.getAllBlogs().stream()
                .filter(b -> !b.slug().equals(blog.slug()))
                .limit(3)
                .toList();
        return new BlogDetailResponse(blog, curatedHotels, related);
    }

    /* ───────────── helpers ───────────── */

    private double recommendedScore(Hotel h) {
        return h.rating() * 10.0 + h.deal() * 0.25 + Math.log10(Math.max(1, h.reviews())) * 2.0;
    }

    private List<NearbyPlace> computeNearby(Hotel hotel, List<Landmark> landmarks) {
        return landmarks.stream().map(lm -> {
            double km = kmBetween(hotel.lat(), hotel.lng(), lm.lat(), lm.lng());
            boolean walk = km < 1.6;
            String time = walk
                    ? Math.max(2, (int) Math.round(km * 13)) + " min walk"
                    : (int) Math.round(km * 2.2 + 4) + " min drive";
            double roundedKm = Math.round(km * 10.0) / 10.0;
            return new NearbyPlace(lm.name(), roundedKm, time, walk);
        }).toList();
    }

    private double kmBetween(double lat1, double lng1, double lat2, double lng2) {
        double dx = (lng2 - lng1) * Math.cos(Math.toRadians((lat1 + lat2) / 2.0)) * 111.32;
        double dy = (lat2 - lat1) * 110.57;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private boolean includesSaturdayNight(String checkIn, String checkOut) {
        try {
            LocalDate start = LocalDate.parse(checkIn);
            LocalDate end = LocalDate.parse(checkOut);
            for (LocalDate d = start; d.isBefore(end); d = d.plusDays(1)) {
                if (d.getDayOfWeek() == DayOfWeek.SATURDAY) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private String formatInr(int amount) {
        return String.format(Locale.forLanguageTag("en-IN"), "%,d", amount);
    }
}
