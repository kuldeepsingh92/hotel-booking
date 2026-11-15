package com.laorvia.api.repository;

import com.laorvia.api.model.Models.*;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.*;

/**
 * Pure Redis-only persistence layer.
 * Every single catalog item, editorial article, coupon, user, session, booking,
 * review, chat thread, and wishlist item is stored in and retrieved from Redis.
 */
@Repository
public class RedisStoreRepository {

    public static final String KEY_CITIES = "laorvia:cities";
    public static final String KEY_CITY_PREFIX = "laorvia:city:";
    public static final String KEY_HOTELS = "laorvia:hotels";
    public static final String KEY_HOTELS_ORDER = "laorvia:hotels:order";
    public static final String KEY_HOTELS_BY_CITY_PREFIX = "laorvia:hotels:byCity:";
    public static final String KEY_LANDMARKS_PREFIX = "laorvia:landmarks:";
    public static final String KEY_HOSTS = "laorvia:hosts";
    public static final String KEY_COUPONS = "laorvia:coupons";
    public static final String KEY_ADDONS = "laorvia:addons";
    public static final String KEY_BLOGS = "laorvia:blogs";
    public static final String KEY_BLOGS_ORDER = "laorvia:blogs:order";
    public static final String KEY_HOME_TESTIMONIALS = "laorvia:home:testimonials";
    public static final String KEY_HOME_FAQS = "laorvia:home:faqs";
    public static final String KEY_HOME_PROMISES = "laorvia:home:promises";
    public static final String KEY_HOME_TABS = "laorvia:home:tabs";
    public static final String KEY_META = "laorvia:meta";
    public static final String KEY_SEED_INFO = "laorvia:seed:info";

    public static final String KEY_USERS = "laorvia:users";
    public static final String KEY_USERS_BY_EMAIL = "laorvia:users:byEmail";
    public static final String KEY_BOOKINGS = "laorvia:bookings";
    public static final String KEY_BOOKINGS_BY_USER_PREFIX = "laorvia:bookings:byUser:";
    public static final String KEY_BOOKINGS_BY_GUEST_PREFIX = "laorvia:bookings:guest:";
    public static final String KEY_THREADS = "laorvia:threads";
    public static final String KEY_SAVED_PREFIX = "laorvia:saved:";

    private final StringRedisTemplate redis;
    private final JsonMapper json;

    public RedisStoreRepository(StringRedisTemplate redis, JsonMapper json) {
        this.redis = redis;
        this.json = json;
    }

    /* ───────────── Health & Metadata ───────────── */

    public String ping() {
        return redis.execute((org.springframework.data.redis.core.RedisCallback<String>) connection -> connection.ping());
    }

    public Optional<SeedInfo> getSeedInfo() {
        return readValue(KEY_SEED_INFO, SeedInfo.class);
    }

    public Map<String, Long> getCounts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("cities", (long) getCities().size());
        counts.put("hotels", nullSafe(redis.opsForHash().size(KEY_HOTELS)));
        counts.put("blogs", nullSafe(redis.opsForHash().size(KEY_BLOGS)));
        counts.put("coupons", nullSafe(redis.opsForHash().size(KEY_COUPONS)));
        counts.put("addons", nullSafe(redis.opsForHash().size(KEY_ADDONS)));
        counts.put("users", nullSafe(redis.opsForHash().size(KEY_USERS)));
        counts.put("bookings", nullSafe(redis.opsForHash().size(KEY_BOOKINGS)));
        counts.put("threads", nullSafe(redis.opsForHash().size(KEY_THREADS)));
        return counts;
    }

    /* ───────────── Cities & Landmarks & Hosts ───────────── */

    public List<City> getCities() {
        return readList(KEY_CITIES, new TypeReference<>() {});
    }

    public Optional<City> getCity(String cityId) {
        return readValue(KEY_CITY_PREFIX + cityId, City.class);
    }

    public List<Landmark> getLandmarks(String cityId) {
        return readList(KEY_LANDMARKS_PREFIX + cityId, new TypeReference<>() {});
    }

    public Map<String, List<Landmark>> getAllLandmarks() {
        Map<String, List<Landmark>> map = new LinkedHashMap<>();
        for (City c : getCities()) {
            map.put(c.id(), getLandmarks(c.id()));
        }
        return map;
    }

    public Map<String, PropertyHost> getAllHosts() {
        Map<Object, Object> entries = redis.opsForHash().entries(KEY_HOSTS);
        Map<String, PropertyHost> map = new LinkedHashMap<>();
        entries.forEach((k, v) -> {
            if (k != null && v != null) {
                map.put(k.toString(), json.readValue(v.toString(), PropertyHost.class));
            }
        });
        return map;
    }

    public Optional<PropertyHost> getHost(String cityId) {
        Object raw = redis.opsForHash().get(KEY_HOSTS, cityId);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw.toString(), PropertyHost.class));
    }

    /* ───────────── Hotels ───────────── */

    public List<Hotel> getAllHotels() {
        List<String> order = redis.opsForList().range(KEY_HOTELS_ORDER, 0, -1);
        Map<Object, Object> entries = redis.opsForHash().entries(KEY_HOTELS);
        if (entries.isEmpty()) return List.of();

        List<Hotel> out = new ArrayList<>(entries.size());
        Set<String> seen = new HashSet<>();
        if (order != null) {
            for (String id : order) {
                Object raw = entries.get(id);
                if (raw != null && seen.add(id)) {
                    out.add(json.readValue(raw.toString(), Hotel.class));
                }
            }
        }
        for (Map.Entry<Object, Object> e : entries.entrySet()) {
            String id = e.getKey().toString();
            if (seen.add(id) && e.getValue() != null) {
                out.add(json.readValue(e.getValue().toString(), Hotel.class));
            }
        }
        return out;
    }

    public List<Hotel> getHotelsByCity(String cityId) {
        if (cityId == null || cityId.isBlank()) {
            return getAllHotels();
        }
        Set<String> ids = redis.opsForSet().members(KEY_HOTELS_BY_CITY_PREFIX + cityId);
        if (ids == null || ids.isEmpty()) return List.of();

        List<String> order = redis.opsForList().range(KEY_HOTELS_ORDER, 0, -1);
        List<Object> orderedIds = new ArrayList<>();
        if (order != null) {
            for (String id : order) {
                if (ids.contains(id)) orderedIds.add(id);
            }
        }
        for (String id : ids) {
            if (!orderedIds.contains(id)) orderedIds.add(id);
        }

        List<Object> rawList = redis.opsForHash().multiGet(KEY_HOTELS, orderedIds);
        List<Hotel> out = new ArrayList<>();
        for (Object raw : rawList) {
            if (raw != null) {
                out.add(json.readValue(raw.toString(), Hotel.class));
            }
        }
        return out;
    }

    public Optional<Hotel> getHotel(String hotelId) {
        Object raw = redis.opsForHash().get(KEY_HOTELS, hotelId);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw.toString(), Hotel.class));
    }

    public void saveHotel(Hotel hotel) {
        redis.opsForHash().put(KEY_HOTELS, hotel.id(), json.writeValueAsString(hotel));
    }

    /* ───────────── Coupons & Add-ons ───────────── */

    public List<Coupon> getAllCoupons() {
        return readHashValues(KEY_COUPONS, Coupon.class);
    }

    public Optional<Coupon> getCoupon(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        Object raw = redis.opsForHash().get(KEY_COUPONS, code.trim().toUpperCase(Locale.ROOT));
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw.toString(), Coupon.class));
    }

    public List<Addon> getAllAddons() {
        List<Addon> list = readHashValues(KEY_ADDONS, Addon.class);
        List<String> order = List.of("breakfast", "transfer", "late");
        list.sort(Comparator.comparingInt(a -> {
            int idx = order.indexOf(a.id());
            return idx == -1 ? 99 : idx;
        }));
        return list;
    }

    public Optional<Addon> getAddon(String id) {
        Object raw = redis.opsForHash().get(KEY_ADDONS, id);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw.toString(), Addon.class));
    }

    /* ───────────── Blogs & Home Content & Meta ───────────── */

    public List<BlogArticle> getAllBlogs() {
        List<String> order = redis.opsForList().range(KEY_BLOGS_ORDER, 0, -1);
        Map<Object, Object> entries = redis.opsForHash().entries(KEY_BLOGS);
        if (entries.isEmpty()) return List.of();

        List<BlogArticle> out = new ArrayList<>(entries.size());
        Set<String> seen = new HashSet<>();
        if (order != null) {
            for (String slug : order) {
                Object raw = entries.get(slug);
                if (raw != null && seen.add(slug)) {
                    out.add(json.readValue(raw.toString(), BlogArticle.class));
                }
            }
        }
        for (Map.Entry<Object, Object> e : entries.entrySet()) {
            String slug = e.getKey().toString();
            if (seen.add(slug) && e.getValue() != null) {
                out.add(json.readValue(e.getValue().toString(), BlogArticle.class));
            }
        }
        return out;
    }

    public Optional<BlogArticle> getBlog(String slug) {
        Object raw = redis.opsForHash().get(KEY_BLOGS, slug);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw.toString(), BlogArticle.class));
    }

    public HomeContent getHomeContent() {
        List<Testimonial> testimonials = readList(KEY_HOME_TESTIMONIALS, new TypeReference<>() {});
        List<HomeFaq> faqs = readList(KEY_HOME_FAQS, new TypeReference<>() {});
        List<HomePromise> promises = readList(KEY_HOME_PROMISES, new TypeReference<>() {});
        List<HomeTab> tabs = readList(KEY_HOME_TABS, new TypeReference<>() {});
        return new HomeContent(testimonials, faqs, promises, tabs);
    }

    public Optional<PortalMeta> getMeta() {
        return readValue(KEY_META, PortalMeta.class);
    }

    /* ───────────── Users & Sessions ───────────── */

    public Optional<User> getUserById(String userId) {
        if (userId == null || userId.isBlank()) return Optional.empty();
        Object raw = redis.opsForHash().get(KEY_USERS, userId);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw.toString(), User.class));
    }

    public Optional<User> getUserByEmail(String email) {
        if (email == null || email.isBlank()) return Optional.empty();
        Object userId = redis.opsForHash().get(KEY_USERS_BY_EMAIL, email.trim().toLowerCase(Locale.ROOT));
        return userId == null ? Optional.empty() : getUserById(userId.toString());
    }

    public void saveUser(User user) {
        redis.opsForHash().put(KEY_USERS, user.id(), json.writeValueAsString(user));
        redis.opsForHash().put(KEY_USERS_BY_EMAIL, user.email().trim().toLowerCase(Locale.ROOT), user.id());
    }

    public void deleteUser(User user) {
        redis.opsForHash().delete(KEY_USERS, user.id());
        redis.opsForHash().delete(KEY_USERS_BY_EMAIL, user.email().trim().toLowerCase(Locale.ROOT));
        Set<String> refs = redis.opsForSet().members(KEY_BOOKINGS_BY_USER_PREFIX + user.id());
        if (refs != null && !refs.isEmpty()) {
            redis.opsForHash().delete(KEY_BOOKINGS, refs.toArray());
            redis.opsForHash().delete(KEY_THREADS, refs.toArray());
        }
        redis.delete(KEY_BOOKINGS_BY_USER_PREFIX + user.id());
        redis.delete(KEY_SAVED_PREFIX + "user:" + user.id());
    }

    /* ───────────── Bookings & Threads ───────────── */

    public void saveBooking(Booking booking, String guestToken) {
        redis.opsForHash().put(KEY_BOOKINGS, booking.ref(), json.writeValueAsString(booking));
        if (booking.userId() != null && !booking.userId().isBlank()) {
            redis.opsForSet().add(KEY_BOOKINGS_BY_USER_PREFIX + booking.userId(), booking.ref());
        } else if (guestToken != null && !guestToken.isBlank()) {
            redis.opsForSet().add(KEY_BOOKINGS_BY_GUEST_PREFIX + guestToken, booking.ref());
            redis.expire(KEY_BOOKINGS_BY_GUEST_PREFIX + guestToken, Duration.ofDays(14));
        }
    }

    public Optional<Booking> getBooking(String ref) {
        if (ref == null || ref.isBlank()) return Optional.empty();
        Object raw = redis.opsForHash().get(KEY_BOOKINGS, ref);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw.toString(), Booking.class));
    }

    public List<Booking> getBookingsForUser(String userId) {
        Set<String> refs = redis.opsForSet().members(KEY_BOOKINGS_BY_USER_PREFIX + userId);
        if (refs == null || refs.isEmpty()) return List.of();
        List<Object> rawList = redis.opsForHash().multiGet(KEY_BOOKINGS, new ArrayList<Object>(refs));
        List<Booking> out = new ArrayList<>();
        for (Object raw : rawList) {
            if (raw != null) out.add(json.readValue(raw.toString(), Booking.class));
        }
        out.sort(Comparator.comparing(Booking::createdAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return out;
    }

    public boolean isGuestBooking(String guestToken, String ref) {
        if (guestToken == null || guestToken.isBlank() || ref == null) return false;
        Boolean member = redis.opsForSet().isMember(KEY_BOOKINGS_BY_GUEST_PREFIX + guestToken, ref);
        return Boolean.TRUE.equals(member);
    }

    public void claimGuestBookings(String guestToken, String userId) {
        if (guestToken == null || guestToken.isBlank()) return;
        String guestKey = KEY_BOOKINGS_BY_GUEST_PREFIX + guestToken;
        Set<String> refs = redis.opsForSet().members(guestKey);
        if (refs == null || refs.isEmpty()) return;
        for (String ref : refs) {
            getBooking(ref).ifPresent(b -> {
                if (b.userId() == null || b.userId().isBlank()) {
                    Booking claimed = new Booking(
                            b.ref(), userId, b.hotelId(), b.roomIndex(), b.roomName(), b.rateId(), b.rateName(),
                            b.checkIn(), b.checkOut(), b.nights(), b.adults(), b.children(), b.rooms(),
                            b.firstName(), b.lastName(), b.email(), b.phone(), b.arrival(), b.requests(), b.notes(),
                            b.addons(), b.roomTotal(), b.addonsTotal(), b.coupon(), b.discount(), b.total(), b.taxes(),
                            b.payments(), b.paymentMethod(), b.refundable(), b.freeCancelUntil(), b.cancelledAt(),
                            b.refundAmount(), b.review(), b.createdAt(), b.sample()
                    );
                    saveBooking(claimed, null);
                }
            });
        }
        redis.delete(guestKey);
    }

    public ChatThread getThread(String ref) {
        Object raw = redis.opsForHash().get(KEY_THREADS, ref);
        if (raw == null) return new ChatThread(ref, List.of());
        return json.readValue(raw.toString(), ChatThread.class);
    }

    public List<ChatThread> getThreadsForRefs(List<String> refs) {
        if (refs.isEmpty()) return List.of();
        List<Object> rawList = redis.opsForHash().multiGet(KEY_THREADS, new ArrayList<Object>(refs));
        List<ChatThread> out = new ArrayList<>();
        for (Object raw : rawList) {
            if (raw != null) out.add(json.readValue(raw.toString(), ChatThread.class));
        }
        return out;
    }

    public void saveThread(ChatThread thread) {
        redis.opsForHash().put(KEY_THREADS, thread.ref(), json.writeValueAsString(thread));
    }

    /* ───────────── Saved Wishlist ───────────── */

    public List<String> getSaved(String ownerKey) {
        Set<String> members = redis.opsForSet().members(KEY_SAVED_PREFIX + ownerKey);
        if (members == null || members.isEmpty()) return List.of();
        return members.stream().sorted().toList();
    }

    public List<String> addSaved(String ownerKey, String hotelId) {
        redis.opsForSet().add(KEY_SAVED_PREFIX + ownerKey, hotelId);
        return getSaved(ownerKey);
    }

    public List<String> removeSaved(String ownerKey, String hotelId) {
        redis.opsForSet().remove(KEY_SAVED_PREFIX + ownerKey, hotelId);
        return getSaved(ownerKey);
    }

    public void mergeGuestSaved(String guestToken, String userId) {
        if (guestToken == null || guestToken.isBlank()) return;
        String guestKey = KEY_SAVED_PREFIX + "guest:" + guestToken;
        Set<String> members = redis.opsForSet().members(guestKey);
        if (members != null && !members.isEmpty()) {
            redis.opsForSet().add(KEY_SAVED_PREFIX + "user:" + userId, members.toArray(String[]::new));
            redis.delete(guestKey);
        }
    }

    /* ───────────── Internal JSON helpers ───────────── */

    private <T> Optional<T> readValue(String key, Class<T> clazz) {
        String raw = redis.opsForValue().get(key);
        return raw == null ? Optional.empty() : Optional.of(json.readValue(raw, clazz));
    }

    private <T> List<T> readList(String key, TypeReference<List<T>> typeRef) {
        String raw = redis.opsForValue().get(key);
        return raw == null ? List.of() : json.readValue(raw, typeRef);
    }

    private <T> List<T> readHashValues(String key, Class<T> clazz) {
        Map<Object, Object> entries = redis.opsForHash().entries(key);
        List<T> out = new ArrayList<>(entries.size());
        for (Object v : entries.values()) {
            if (v != null) out.add(json.readValue(v.toString(), clazz));
        }
        return out;
    }

    private long nullSafe(Long value) {
        return value == null ? 0L : value;
    }
}
