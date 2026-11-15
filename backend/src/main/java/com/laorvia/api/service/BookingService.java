package com.laorvia.api.service;

import com.laorvia.api.model.Models.*;
import com.laorvia.api.repository.RedisStoreRepository;
import com.laorvia.api.security.RequestContext;
import com.laorvia.api.security.SecurityStore;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@Service
public class BookingService {

    private static final String REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RedisStoreRepository store;
    private final CatalogService catalogService;
    private final SecurityStore security;

    public BookingService(RedisStoreRepository store, CatalogService catalogService, SecurityStore security) {
        this.store = store;
        this.catalogService = catalogService;
        this.security = security;
    }

    /* ───────────────────────── create ───────────────────────── */

    public Booking createBooking(CreateBookingRequest req) {
        String userId = RequestContext.userIdOrNull();
        String guestToken = RequestContext.guestToken();
        String idem = RequestContext.idempotencyKey();
        String scope = "booking:" + (userId != null ? "user:" + userId : "guest:" + guestToken);

        if (idem != null) {
            Optional<String> existingRef = security.idempotentResult(scope, idem);
            if (existingRef.isPresent()) {
                return store.getBooking(existingRef.get())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Duplicate request."));
            }
        }

        Hotel hotel = store.getHotel(req.hotelId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stay not found."));
        if (req.roomIndex() < 0 || req.roomIndex() >= hotel.rooms().size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid room selection.");
        }
        Room room = hotel.rooms().get(req.roomIndex());
        RatePlan rate = room.rates().stream()
                .filter(r -> r.id().equals(req.rateId()))
                .findFirst()
                .orElse(room.rates().getFirst());

        LocalDate inDate = LocalDate.parse(req.checkIn());
        LocalDate outDate = LocalDate.parse(req.checkOut());
        if (!outDate.isAfter(inDate) || ChronoUnit.DAYS.between(inDate, outDate) > 60) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please choose valid stay dates (maximum 60 nights).");
        }
        int nights = (int) Math.max(1, ChronoUnit.DAYS.between(inDate, outDate));
        if (inDate.isBefore(LocalDate.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Check-in cannot be in the past.");
        }
        int guests = req.adults() + req.children();
        if (guests > room.sleeps() * req.rooms()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This room sleeps " + room.sleeps() + " per room. Add a room or choose a larger room.");
        }

        int roomTotal = rate.price() * nights * req.rooms();
        List<BookingAddon> bookingAddons = new ArrayList<>();
        if (req.addonIds() != null) {
            for (String addonId : req.addonIds()) {
                store.getAddon(addonId).ifPresent(a -> {
                    int amount = switch (a.billing()) {
                        case "PER_GUEST_PER_NIGHT" -> a.price() * nights * guests;
                        case "PER_ROOM" -> a.price() * req.rooms();
                        default -> a.price();
                    };
                    bookingAddons.add(new BookingAddon(a.id(), a.title(), amount));
                });
            }
        }
        int addonsTotal = bookingAddons.stream().mapToInt(BookingAddon::amount).sum();

        int discount = 0;
        String appliedCoupon = null;
        if (req.couponCode() != null && !req.couponCode().isBlank()) {
            CouponEvaluateResponse eval = catalogService.evaluateCoupon(
                    new CouponEvaluateRequest(req.couponCode(), roomTotal, nights, req.checkIn(), req.checkOut())
            );
            if (eval.ok() && eval.discount() > 0 && eval.coupon() != null) {
                discount = Math.min(eval.discount(), roomTotal);
                appliedCoupon = eval.coupon().code();
            }
        }

        int total = Math.max(0, roomTotal + addonsTotal - discount);
        if (total <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking total is invalid.");
        }
        int taxes = (int) Math.round((total * 0.12) / 1.12);
        boolean payLater = req.payLater() && rate.payAtProperty();
        int paidNow = payLater ? 0 : total;
        String nowIso = Instant.now().toString();
        String ref = generateRef();

        List<Payment> payments = paidNow > 0
                ? List.of(new Payment("p_" + UUID.randomUUID().toString().substring(0, 8), paidNow, safeMethod(req.paymentMethod()), nowIso, "payment"))
                : List.of();

        Booking booking = new Booking(
                ref, userId, hotel.id(), req.roomIndex(), room.name(), rate.id(), rate.name(),
                req.checkIn(), req.checkOut(), nights, req.adults(), req.children(), req.rooms(),
                req.firstName().trim(), req.lastName().trim(), req.email().trim(), req.phone().trim(),
                req.arrival() == null ? "" : req.arrival(),
                req.requests() == null ? List.of() : req.requests(),
                truncate(req.notes(), 300),
                bookingAddons, roomTotal, addonsTotal, appliedCoupon, discount, total, taxes,
                payments, payLater ? "Pay at the property" : safeMethod(req.paymentMethod()),
                rate.refundable(), rate.refundable() ? freeCancelUntil(inDate) : null,
                null, 0, null, nowIso, false
        );

        store.saveBooking(booking, guestToken);
        if (idem != null) {
            security.saveIdempotentResult(scope, idem, ref, Duration.ofHours(24));
        }

        PropertyHost host = store.getHost(hotel.cityId())
                .orElse(new PropertyHost("Guest Relations", "Property Host", "+91 22 4100 8800"));
        String welcome = "Namaste " + booking.firstName() + " ji — thank you for choosing " + hotel.name()
                + ". Your booking (" + ref + ") is confirmed"
                + (!booking.requests().isEmpty() ? " with your requests (" + String.join(", ", booking.requests()) + ") noted" : "")
                + ". Message me (" + host.name() + ") here anytime before arrival.";
        store.saveThread(new ChatThread(ref, List.of(
                new Message("m_" + UUID.randomUUID().toString().substring(0, 8), "property", welcome, nowIso, false)
        )));

        return booking;
    }

    public AccountBookingsResponse listForUser() {
        String userId = RequestContext.requireUserId();
        List<Booking> bookings = store.getBookingsForUser(userId);
        List<String> refs = bookings.stream().map(Booking::ref).toList();
        return new AccountBookingsResponse(bookings, store.getThreadsForRefs(refs));
    }

    public Booking getBooking(String ref) {
        return requireAccess(ref);
    }

    /* ───────────────────────── money ───────────────────────── */

    public PayBalanceResponse payBalance(String ref, PayBalanceRequest req) {
        String userId = RequestContext.requireUserId();
        Booking booking = requireOwned(ref, userId);
        if (booking.cancelledAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancelled bookings cannot be paid.");
        }
        int due = balanceDue(booking);
        if (due <= 0) {
            return new PayBalanceResponse(0, booking);
        }
        String idemScope = "pay:" + ref;
        String idem = RequestContext.idempotencyKey();
        if (idem != null) {
            Optional<String> previous = security.idempotentResult(idemScope, idem);
            if (previous.isPresent()) {
                return new PayBalanceResponse(0, requireOwned(ref, userId));
            }
        }

        List<Payment> payments = new ArrayList<>(booking.payments());
        payments.add(new Payment("p_" + UUID.randomUUID().toString().substring(0, 8), due,
                safeMethod(req.method()), Instant.now().toString(), "payment"));
        Booking updated = withPayments(booking, payments, safeMethod(req.method()), booking.cancelledAt(), booking.refundAmount());
        store.saveBooking(updated, null);
        if (idem != null) {
            security.saveIdempotentResult(idemScope, idem, String.valueOf(due), Duration.ofHours(24));
        }
        return new PayBalanceResponse(due, updated);
    }

    public CancelBookingResponse cancelBooking(String ref) {
        String userId = RequestContext.requireUserId();
        Booking booking = requireOwned(ref, userId);
        if (booking.cancelledAt() != null) {
            return new CancelBookingResponse(booking.refundAmount(), false, booking);
        }
        int paid = Math.max(0, paidOf(booking));
        boolean free = booking.refundable()
                && booking.freeCancelUntil() != null
                && !LocalDate.now().isAfter(LocalDate.parse(booking.freeCancelUntil()));
        int firstNight = Math.round((float) booking.roomTotal() / Math.max(1, booking.nights()));
        int refund = Math.min(paid, free ? paid : Math.max(0, paid - firstNight));
        String nowIso = Instant.now().toString();

        List<Payment> payments = new ArrayList<>(booking.payments());
        if (refund > 0) {
            payments.add(new Payment("r_" + UUID.randomUUID().toString().substring(0, 8), refund,
                    booking.paymentMethod(), nowIso, "refund"));
        }
        Booking updated = withPayments(booking, payments, booking.paymentMethod(), nowIso, refund);
        store.saveBooking(updated, null);
        return new CancelBookingResponse(refund, free, updated);
    }

    /* ───────────────────────── reviews ───────────────────────── */

    public Booking saveReview(String ref, SaveReviewRequest req) {
        String userId = RequestContext.requireUserId();
        Booking booking = requireOwned(ref, userId);
        if (booking.cancelledAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancelled stays cannot be reviewed.");
        }
        if (booking.checkOut().compareTo(LocalDate.now().toString()) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reviews open after check-out.");
        }
        User user = store.getUserById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account not found."));
        BookingReview review = new BookingReview(
                req.score(),
                req.scores(),
                truncate(req.title(), 100),
                truncate(req.text(), 1200),
                Instant.now().toString()
        );
        Booking updated = withReview(booking, review);
        store.saveBooking(updated, null);
        syncHotelReview(booking.hotelId(), user, review, booking.review() == null);
        return updated;
    }

    public Booking deleteReview(String ref) {
        String userId = RequestContext.requireUserId();
        Booking booking = requireOwned(ref, userId);
        Booking updated = withReview(booking, null);
        store.saveBooking(updated, null);
        return updated;
    }

    /* ───────────────────────── messaging ───────────────────────── */

    public ChatThread getThread(String ref) {
        requireOwned(ref, RequestContext.requireUserId());
        return store.getThread(ref);
    }

    public ChatThread sendMessage(String ref, SendMessageRequest req) {
        String userId = RequestContext.requireUserId();
        Booking booking = requireOwned(ref, userId);
        String clean = truncate(req.text(), 1200);
        if (clean.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Message cannot be empty.");
        }
        ChatThread current = store.getThread(ref);
        List<Message> messages = new ArrayList<>(current.messages());
        messages.add(new Message("m_" + UUID.randomUUID().toString().substring(0, 8), "guest", clean, Instant.now().toString(), true));
        ChatThread updated = new ChatThread(ref, messages);
        store.saveThread(updated);

        String replyText = buildHostReply(clean, booking);
        CompletableFuture.delayedExecutor(1200, TimeUnit.MILLISECONDS).execute(() -> {
            ChatThread latest = store.getThread(ref);
            List<Message> next = new ArrayList<>(latest.messages());
            next.add(new Message("m_" + UUID.randomUUID().toString().substring(0, 8), "property", replyText, Instant.now().toString(), false));
            store.saveThread(new ChatThread(ref, next));
        });
        return updated;
    }

    public ChatThread markThreadRead(String ref) {
        requireOwned(ref, RequestContext.requireUserId());
        ChatThread current = store.getThread(ref);
        List<Message> read = current.messages().stream()
                .map(m -> m.read() ? m : new Message(m.id(), m.from(), m.text(), m.at(), true))
                .toList();
        ChatThread updated = new ChatThread(ref, read);
        store.saveThread(updated);
        return updated;
    }

    /* ───────────────────────── saved wishlist ───────────────────────── */

    public List<String> getSaved() {
        return ownerKey().map(store::getSaved).orElse(List.of());
    }

    public List<String> addSaved(String hotelId) {
        String key = ownerKey().orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing secure session."));
        return store.addSaved(key, hotelId);
    }

    public List<String> removeSaved(String hotelId) {
        String key = ownerKey().orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing secure session."));
        return store.removeSaved(key, hotelId);
    }

    /* ───────────────────────── internal ───────────────────────── */

    private Optional<String> ownerKey() {
        String userId = RequestContext.userIdOrNull();
        if (userId != null) return Optional.of("user:" + userId);
        String guest = RequestContext.guestToken();
        if (guest != null && !guest.isBlank()) return Optional.of("guest:" + guest);
        return Optional.empty();
    }

    private Booking requireAccess(String ref) {
        Booking booking = store.getBooking(ref)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
        String userId = RequestContext.userIdOrNull();
        if (booking.userId() != null) {
            if (userId == null || !booking.userId().equals(userId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this booking.");
            }
        } else if (userId != null || !store.isGuestBooking(RequestContext.guestToken(), ref)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this booking.");
        }
        return booking;
    }

    private Booking requireOwned(String ref, String userId) {
        Booking booking = store.getBooking(ref)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found."));
        if (!userId.equals(booking.userId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not own this booking.");
        }
        return booking;
    }

    private Booking withPayments(Booking b, List<Payment> payments, String method, String cancelledAt, int refund) {
        return new Booking(b.ref(), b.userId(), b.hotelId(), b.roomIndex(), b.roomName(), b.rateId(), b.rateName(),
                b.checkIn(), b.checkOut(), b.nights(), b.adults(), b.children(), b.rooms(), b.firstName(), b.lastName(),
                b.email(), b.phone(), b.arrival(), b.requests(), b.notes(), b.addons(), b.roomTotal(), b.addonsTotal(),
                b.coupon(), b.discount(), b.total(), b.taxes(), payments, method, b.refundable(), b.freeCancelUntil(),
                cancelledAt, refund, b.review(), b.createdAt(), b.sample());
    }

    private Booking withReview(Booking b, BookingReview review) {
        return new Booking(b.ref(), b.userId(), b.hotelId(), b.roomIndex(), b.roomName(), b.rateId(), b.rateName(),
                b.checkIn(), b.checkOut(), b.nights(), b.adults(), b.children(), b.rooms(), b.firstName(), b.lastName(),
                b.email(), b.phone(), b.arrival(), b.requests(), b.notes(), b.addons(), b.roomTotal(), b.addonsTotal(),
                b.coupon(), b.discount(), b.total(), b.taxes(), b.payments(), b.paymentMethod(), b.refundable(),
                b.freeCancelUntil(), b.cancelledAt(), b.refundAmount(), review, b.createdAt(), b.sample());
    }

    private int paidOf(Booking b) {
        return b.payments().stream()
                .mapToInt(p -> "refund".equalsIgnoreCase(p.kind()) ? -p.amount() : p.amount())
                .sum();
    }

    private int balanceDue(Booking b) {
        return b.cancelledAt() != null ? 0 : Math.max(0, b.total() - paidOf(b));
    }

    private String freeCancelUntil(LocalDate checkIn) {
        LocalDate deadline = checkIn.minusDays(2);
        LocalDate today = LocalDate.now();
        return (deadline.isBefore(today) ? today : deadline).toString();
    }

    private String generateRef() {
        StringBuilder sb = new StringBuilder("LN-");
        for (int i = 0; i < 6; i++) sb.append(REF_ALPHABET.charAt(RANDOM.nextInt(REF_ALPHABET.length())));
        return sb.toString();
    }

    private static String safeMethod(String method) {
        if (method == null || method.isBlank()) return "Card";
        String t = method.replaceAll("[<>\\r\\n]", "").trim();
        return t.length() > 80 ? t.substring(0, 80) : t;
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        String t = value.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private void syncHotelReview(String hotelId, User user, BookingReview review, boolean isNew) {
        store.getHotel(hotelId).ifPresent(hotel -> {
            String initial = (user.lastName() != null && !user.lastName().isEmpty())
                    ? " " + user.lastName().charAt(0) + "." : "";
            String author = user.firstName() + initial;
            List<HotelReview> reviews = new ArrayList<>();
            reviews.add(new HotelReview(author, "Verified Laorvia Guest", "Verified stay",
                    review.title(), review.text(), review.score(), 0));
            for (HotelReview existing : hotel.guestReviews()) {
                if (!existing.name().equals(author)) reviews.add(existing);
            }
            Hotel updated = new Hotel(
                    hotel.id(), hotel.name(), hotel.cityId(), hotel.area(), hotel.type(), hotel.stars(),
                    hotel.rating(), isNew ? hotel.reviews() + 1 : hotel.reviews(), hotel.price(), hotel.wasPrice(),
                    hotel.deal(), hotel.lat(), hotel.lng(), hotel.distance(), hotel.amenities(), hotel.highlights(),
                    hotel.breakfast(), hotel.flex(), hotel.tags(), hotel.blurb(), hotel.images(), hotel.rooms(),
                    hotel.scores(), reviews.subList(0, Math.min(6, reviews.size())),
                    hotel.checkInTime(), hotel.checkOutTime()
            );
            store.saveHotel(updated);
        });
    }

    private String buildHostReply(String text, Booking booking) {
        String t = text.toLowerCase(Locale.ROOT);
        if (t.contains("jain") || t.contains("veg") || t.contains("food") || t.contains("meal")) {
            return "Namaste " + booking.firstName() + " ji — our kitchen team has noted your Pure Veg / Jain request. Separate cookware and freshly prepared meals will be ready.";
        }
        if (t.contains("late") || t.contains("delay") || t.contains("arrive") || t.contains("arrival")) {
            return "Noted — thank you for informing us. Reception is staffed 24 hours and your room will be held ready.";
        }
        if (t.contains("cot") || t.contains("baby") || t.contains("child") || t.contains("bed")) {
            return "We have added that to your room setup. Baby cots and milk-warming kettles are complimentary.";
        }
        if (t.contains("airport") || t.contains("pick") || t.contains("transfer") || t.contains("cab") || t.contains("train")) {
            return "We would be glad to arrange an AC sedan pickup. Share your flight or train number and our driver will meet you with a name placard.";
        }
        if (t.contains("early") || t.contains("check-in") || t.contains("check in")) {
            return "Your early arrival request is flagged. You can drop bags anytime and freshen up while the room is prepared.";
        }
        return "Namaste " + booking.firstName() + " ji — received. I have passed your message to the duty manager for booking "
                + booking.ref() + " and we will follow up here shortly.";
    }
}
