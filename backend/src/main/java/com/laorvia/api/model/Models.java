package com.laorvia.api.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/**
 * Domain entities and REST DTOs for Laorvia (all persisted exclusively in Redis).
 */
public final class Models {

    private Models() {}

    /* ───────────── Catalog Entities ───────────── */

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record City(
            String id,
            String name,
            String state,
            String country,
            double lat,
            double lng,
            String centre,
            long image,
            String line
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HotelImage(long id, String label) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RatePlan(
            String id,
            String name,
            int price,
            boolean refundable,
            boolean breakfast,
            boolean payAtProperty
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Room(
            String name,
            int size,
            String bed,
            int sleeps,
            long image,
            List<String> features,
            List<RatePlan> rates
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HotelScore(String label, double value) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HotelReview(
            String name,
            String country,
            String trip,
            String title,
            String text,
            double score,
            int monthsAgo
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Hotel(
            String id,
            String name,
            String cityId,
            String area,
            String type,
            int stars,
            double rating,
            int reviews,
            int price,
            Integer wasPrice,
            int deal,
            double lat,
            double lng,
            double distance,
            List<String> amenities,
            List<String> highlights,
            String breakfast,
            boolean flex,
            List<String> tags,
            String blurb,
            List<HotelImage> images,
            List<Room> rooms,
            List<HotelScore> scores,
            List<HotelReview> guestReviews,
            String checkInTime,
            String checkOutTime
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Landmark(String name, double lat, double lng) {}

    public record NearbyPlace(String name, double km, String time, boolean walk) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PropertyHost(String name, String role, String phone) {}

    /* ───────────── Pricing, Coupons & Add-ons ───────────── */

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Coupon(
            String code,
            String headline,
            String title,
            String desc,
            String kind,
            int value,
            Integer cap,
            Integer minNights,
            Integer minSpend,
            Boolean saturday,
            String expired,
            boolean listed
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Addon(
            String id,
            String title,
            String desc,
            String unit,
            int price,
            String billing
    ) {}

    public record CouponEvaluateRequest(
            @NotBlank String code,
            @Min(0) int roomTotal,
            @Min(1) int nights,
            @NotBlank String checkIn,
            @NotBlank String checkOut
    ) {}

    public record CouponEvaluateResponse(
            boolean ok,
            int discount,
            String reason,
            Coupon coupon
    ) {}

    /* ───────────── Editorial & Home ───────────── */

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BlogAuthor(String name, String role, long avatar, String bio) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BlogCallout(String title, String text) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BlogSection(String id, String heading, List<String> body, BlogCallout callout) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BlogFaq(String question, String answer) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BlogArticle(
            String slug,
            String title,
            String subtitle,
            String category,
            String cityId,
            String readTime,
            String publishedAt,
            String updatedAt,
            BlogAuthor author,
            long heroImage,
            String heroAlt,
            String seoDescription,
            List<String> keywords,
            List<String> keyTakeaways,
            List<BlogSection> sections,
            List<String> hotelIds,
            List<BlogFaq> faqs
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Testimonial(
            String name,
            String location,
            String role,
            String hotelName,
            long avatar,
            String quote,
            String tag,
            int rating
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HomeFaq(String q, String a) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HomePromise(String icon, String title, String text) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HomeTab(String id, String label) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HomeContent(
            List<Testimonial> testimonials,
            List<HomeFaq> faqs,
            List<HomePromise> promises,
            List<HomeTab> tabs
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PortalMeta(
            List<String> propertyTypes,
            Map<String, String> amenities,
            List<String> filterAmenities,
            List<String> specialRequests,
            List<String> banks,
            List<String> countries,
            String heroHotelId,
            String sampleReceiptHotelId,
            List<String> trendingCityIds,
            String demoEmail
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SeedInfo(
            String version,
            String seededAt,
            int cities,
            int hotels,
            int blogs,
            int coupons,
            int addons,
            String demoEmail
    ) {}

    public record BootstrapResponse(
            List<City> cities,
            List<Hotel> hotels,
            Map<String, List<Landmark>> landmarks,
            Map<String, PropertyHost> hosts,
            List<Coupon> coupons,
            List<Addon> addons,
            List<BlogArticle> blogs,
            HomeContent home,
            PortalMeta meta,
            SeedInfo seedInfo
    ) {}

    public record HotelDetailResponse(
            Hotel hotel,
            City city,
            List<NearbyPlace> nearby,
            List<Hotel> similar,
            PropertyHost host
    ) {}

    public record BlogDetailResponse(
            BlogArticle blog,
            List<Hotel> curatedHotels,
            List<BlogArticle> related
    ) {}

    public record HealthResponse(
            String status,
            String redis,
            long latencyMs,
            boolean seeded,
            SeedInfo seedInfo,
            Map<String, Long> counts
    ) {}

    /* ───────────── Account, Bookings, Reviews & Chat ───────────── */

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record User(
            String id,
            String firstName,
            String lastName,
            String email,
            String passwordHash,
            String phone,
            String country,
            boolean marketing,
            String createdAt
    ) {
        public PublicUser toPublic() {
            return new PublicUser(id, firstName, lastName, email, phone, country, marketing, createdAt);
        }
    }

    public record PublicUser(
            String id,
            String firstName,
            String lastName,
            String email,
            String phone,
            String country,
            boolean marketing,
            String createdAt
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Payment(
            String id,
            int amount,
            String method,
            String at,
            String kind
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BookingAddon(String id, String title, int amount) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BookingReview(
            int score,
            Map<String, Integer> scores,
            String title,
            String text,
            String at
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Message(
            String id,
            String from,
            String text,
            String at,
            boolean read
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChatThread(
            String ref,
            List<Message> messages
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Booking(
            String ref,
            String userId,
            String hotelId,
            int roomIndex,
            String roomName,
            String rateId,
            String rateName,
            String checkIn,
            String checkOut,
            int nights,
            int adults,
            int children,
            int rooms,
            String firstName,
            String lastName,
            String email,
            String phone,
            String arrival,
            List<String> requests,
            String notes,
            List<BookingAddon> addons,
            int roomTotal,
            int addonsTotal,
            String coupon,
            int discount,
            int total,
            int taxes,
            List<Payment> payments,
            String paymentMethod,
            boolean refundable,
            String freeCancelUntil,
            String cancelledAt,
            int refundAmount,
            BookingReview review,
            String createdAt,
            boolean sample
    ) {}

    /* ───────────── Auth & Account Requests / Responses ───────────── */

    public record SignUpRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8) String password,
            boolean marketing
    ) {}

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {}

    public record AuthResponse(
            String token,
            PublicUser user,
            List<Booking> bookings,
            List<ChatThread> threads,
            List<String> saved
    ) {}

    public record ProfileUpdateRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            String phone,
            String country,
            boolean marketing
    ) {}

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8) String newPassword
    ) {}

    /* ───────────── Booking & Messaging Requests / Responses ───────────── */

    public record CreateBookingRequest(
            @NotBlank String hotelId,
            @Min(0) int roomIndex,
            @NotBlank String rateId,
            @NotBlank String checkIn,
            @NotBlank String checkOut,
            @Min(1) @Max(8) int adults,
            @Min(0) @Max(6) int children,
            @Min(1) @Max(4) int rooms,
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            @NotBlank String phone,
            String arrival,
            List<String> requests,
            String notes,
            List<String> addonIds,
            String couponCode,
            boolean payLater,
            @NotBlank String paymentMethod
    ) {}

    public record PayBalanceRequest(
            @NotBlank String method
    ) {}

    public record PayBalanceResponse(
            int paidAmount,
            Booking booking
    ) {}

    public record CancelBookingResponse(
            int refund,
            boolean free,
            Booking booking
    ) {}

    public record SaveReviewRequest(
            @Min(1) @Max(10) int score,
            @NotNull Map<String, Integer> scores,
            @NotBlank @Size(min = 3, max = 100) String title,
            @NotBlank @Size(min = 20, max = 1200) String text
    ) {}

    public record SendMessageRequest(
            @NotBlank @Size(max = 1200) String text
    ) {}

    public record AccountBookingsResponse(
            List<Booking> bookings,
            List<ChatThread> threads
    ) {}

    public record ApiError(
            int status,
            String error,
            String message
    ) {}
}
