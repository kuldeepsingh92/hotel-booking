import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight, Ban, BedDouble, Check as CheckIcon, ChevronLeft, ChevronRight, CircleAlert, Clock, Coffee, Images,
  MapPin, Ruler, Share2, Users, Wallet, X,
} from "lucide-react";
import { cn } from "../utils/cn";
import { getAmenityLabel, getCity, getHotel, hotelsIn, nearbyFor, ratingLabel, type Hotel, type NearbyPlace, type Room } from "../data/hotels";
import { fetchHotelDetail } from "../lib/catalog";
import { fmtMed, freeCancelUntil } from "../lib/dates";
import { statusOf, useAccount } from "../lib/account";
import { money, num, plural } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { guestsOf, nightsOf, parseStay, stayQuery, type Stay } from "../lib/stay";
import { Footer, Header } from "../components/Header";
import { DealTag, StayCard } from "../components/HotelCard";
import { MapView } from "../components/MapView";
import { SearchBar } from "../components/SearchBar";
import { AMENITY_ICONS, Img, Modal, RatingBadge, SaveButton, Stars, btnClass, useMedia } from "../components/ui";
import NotFound from "./NotFound";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "rooms", label: "Rooms" },
  { id: "amenities", label: "Amenities" },
  { id: "reviews", label: "Reviews" },
  { id: "location", label: "Location" },
  { id: "policies", label: "Policies" },
];

const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const monthsAgo = (n: number) => {
  const d = new Date();
  return MONTH_YEAR.format(new Date(d.getFullYear(), d.getMonth() - n, 1));
};

function Perk({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2", ok ? "text-ink" : "text-ink-500")}>
      {ok ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-pine-600" aria-hidden /> : <Ban className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />}
      <span>{children}</span>
    </li>
  );
}

function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="display text-[clamp(1.75rem,3vw,2.25rem)] leading-tight">{children}</h2>
      {sub && <p className="mt-1.5 text-ink-500">{sub}</p>}
    </div>
  );
}

/* ───────── gallery + lightbox ───────── */

function Gallery({ hotel, onOpen }: { hotel: Hotel; onOpen: (i: number) => void }) {
  const imgs = hotel.images;
  return (
    <div className="relative">
      {/* phones: swipeable strip */}
      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 sm:hidden">
        {imgs.map((im, i) => (
          <button key={im.id} type="button" onClick={() => onOpen(i)} className="aspect-[4/3] w-[86%] shrink-0 snap-center overflow-hidden rounded-3xl" aria-label={`Open photo ${i + 1}: ${im.label}`}>
            <Img id={im.id} w={640} h={480} alt={`${hotel.name} — ${im.label.toLowerCase()}`} eager={i === 0} className="size-full" />
          </button>
        ))}
      </div>
      {/* larger screens: mosaic */}
      <div className="hidden h-[26rem] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[2rem] sm:grid lg:h-[30rem]">
        {imgs.slice(0, 5).map((im, i) => (
          <button
            key={im.id}
            type="button"
            onClick={() => onOpen(i)}
            className={cn("group relative overflow-hidden bg-sand-100", i === 0 && "col-span-2 row-span-2")}
            aria-label={`Open photo ${i + 1}: ${im.label}`}
          >
            <Img
              id={im.id}
              w={i === 0 ? 960 : 480}
              h={i === 0 ? 800 : 400}
              alt={`${hotel.name} — ${im.label.toLowerCase()}`}
              eager
              className="size-full transition-[transform,filter] duration-500 group-hover:scale-[1.03] group-hover:brightness-95"
            />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onOpen(0)} className={btnClass("light", "sm", "absolute bottom-4 right-4 hidden shadow-lift sm:inline-flex")}>
        <Images className="size-4" aria-hidden />
        All {imgs.length} photos
      </button>
    </div>
  );
}

function Lightbox({ hotel, index, setIndex }: { hotel: Hotel; index: number | null; setIndex: (i: number | null) => void }) {
  const imgs = hotel.images;
  const n = imgs.length;
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((index + 1) % n);
      if (e.key === "ArrowLeft") setIndex((index - 1 + n) % n);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, n, setIndex]);

  const i = index ?? 0;
  const nav = "grid size-11 shrink-0 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20";
  return (
    <Modal open={index !== null} onClose={() => setIndex(null)} title={`${hotel.name} photos`} variant="full">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <p className="text-sm">
          <span className="font-semibold">{imgs[i].label}</span>
          <span className="text-white/60"> · {i + 1} of {n}</span>
        </p>
        <button type="button" onClick={() => setIndex(null)} className={nav} aria-label="Close photos">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-3 px-3 sm:px-6">
        <button type="button" onClick={() => setIndex((i - 1 + n) % n)} className={cn(nav, "hidden sm:grid")} aria-label="Previous photo">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          <img
            key={imgs[i].id}
            src={`https://images.pexels.com/photos/${imgs[i].id}/pexels-photo-${imgs[i].id}.jpeg?auto=compress&cs=tinysrgb&w=1600`}
            alt={`${hotel.name} — ${imgs[i].label.toLowerCase()}`}
            className="max-h-full max-w-full animate-fade rounded-2xl object-contain"
          />
        </div>
        <button type="button" onClick={() => setIndex((i + 1) % n)} className={cn(nav, "hidden sm:grid")} aria-label="Next photo">
          <ChevronRight className="size-6" aria-hidden />
        </button>
      </div>
      <div className="no-scrollbar flex justify-start gap-2 overflow-x-auto px-5 py-4 sm:justify-center">
        {imgs.map((im, k) => (
          <button
            key={im.id}
            type="button"
            onClick={() => setIndex(k)}
            aria-label={`Photo ${k + 1}: ${im.label}`}
            aria-current={k === i}
            className={cn("h-14 w-20 shrink-0 overflow-hidden rounded-lg transition-opacity", k === i ? "ring-2 ring-white" : "opacity-50 hover:opacity-90")}
          >
            <Img id={im.id} w={160} h={112} alt="" className="size-full" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ───────── room card ───────── */

function RoomCard({ hotel, room, index, stay, cancelBy }: { hotel: Hotel; room: Room; index: number; stay: Stay; cancelBy: string }) {
  const nights = nightsOf(stay);
  const mult = nights * stay.rooms;
  const tooSmall = guestsOf(stay) > room.sleeps * stay.rooms;
  const q = stayQuery({ ...stay, dest: hotel.cityId });

  return (
    <article className="overflow-hidden rounded-3xl border border-sand-200 bg-white">
      <div className="grid sm:grid-cols-[15rem_1fr]">
        <Img id={room.image} w={520} h={380} alt={`${room.name} at ${hotel.name}`} className="h-48 w-full sm:h-full" />
        <div className="p-5 sm:p-6">
          <h3 className="display text-2xl leading-tight">{room.name}</h3>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-700">
            <li className="flex items-center gap-1.5">
              <Ruler className="size-4 text-ink-400" aria-hidden />
              {room.size} m²
            </li>
            <li className="flex items-center gap-1.5">
              <BedDouble className="size-4 text-ink-400" aria-hidden />
              {room.bed}
            </li>
            <li className="flex items-center gap-1.5">
              <Users className="size-4 text-ink-400" aria-hidden />
              Sleeps {room.sleeps}
            </li>
          </ul>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {room.features.map((f) => (
              <li key={f} className="rounded-full bg-sand-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                {f}
              </li>
            ))}
          </ul>
          {tooSmall && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-ember-50 p-3 text-sm text-ember-700">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                This room sleeps {room.sleeps}; you're searching for {plural(guestsOf(stay), "guest")} in {plural(stay.rooms, "room")}. Add a room in the guest picker to book it.
              </span>
            </p>
          )}
        </div>
      </div>
      <ul className="divide-y divide-sand-200 border-t border-sand-200">
        {room.rates.map((rate) => (
          <li key={rate.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
            <div>
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {rate.name}
                {rate.id === "nr" && room.rates.length > 1 && <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold text-ink-700">Lowest price</span>}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                <Perk ok={rate.refundable}>{rate.refundable ? `Free cancellation until ${fmtMed(cancelBy)}` : "Non-refundable — can't be changed or cancelled"}</Perk>
                {rate.breakfast && <Perk ok>Breakfast included</Perk>}
                <li className="flex items-start gap-2 text-ink-700">
                  <Wallet className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                  {rate.payAtProperty ? "Pay now or at the property — your choice" : "Pay in full when you book"}
                </li>
              </ul>
            </div>
            <div className="flex items-center justify-between gap-5 sm:justify-end">
              <div className="sm:text-right">
                <p className="leading-tight">
                  <span className="text-[1.35rem] font-bold tracking-tight tabular-nums">{money(rate.price)}</span>
                  <span className="text-sm text-ink-500"> / night</span>
                </p>
                <p className="text-xs text-ink-500">
                  {money(rate.price * mult)} for {plural(nights, "night")}
                  {stay.rooms > 1 && `, ${stay.rooms} rooms`}
                </p>
              </div>
              {tooSmall ? (
                <span className={btnClass("outline", "md", "pointer-events-none opacity-50")} aria-disabled="true">
                  Too small
                </span>
              ) : (
                <Link to={`/book/${hotel.id}?${q}&room=${index}&rate=${rate.id}`} className={btnClass("primary", "md")} aria-label={`Reserve ${room.name}, ${rate.name}, ${money(rate.price)} per night`}>
                  Reserve
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ───────── page ───────── */

function PropertyView({ initialHotel, stay }: { initialHotel: Hotel; stay: Stay }) {
  const [hotel, setHotel] = useState<Hotel>(initialHotel);
  const [nearby, setNearby] = useState<NearbyPlace[]>(() => nearbyFor(initialHotel));
  const [similar, setSimilar] = useState<Hotel[]>(() =>
    hotelsIn(initialHotel.cityId)
      .filter((h) => h.id !== initialHotel.id)
      .sort((a, b) => Math.abs(a.price - initialHotel.price) - Math.abs(b.price - initialHotel.price))
      .slice(0, 3),
  );

  useEffect(() => {
    let alive = true;
    fetchHotelDetail(initialHotel.id)
      .then((detail) => {
        if (!alive) return;
        setHotel(detail.hotel);
        if (detail.nearby?.length) setNearby(detail.nearby);
        if (detail.similar?.length) setSimilar(detail.similar);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initialHotel.id]);

  const city = getCity(hotel.cityId);
  const nights = nightsOf(stay);
  const mult = nights * stay.rooms;
  const cancelBy = freeCancelUntil(stay.checkIn);
  const isLg = useMedia("(min-width: 1024px)");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [active, setActive] = useState("overview");
  const [copied, setCopied] = useState(false);

  const { user, bookings } = useAccount();
  const myTrips = user ? bookings.filter((b) => b.hotelId === hotel.id) : [];
  const myReviewed = myTrips.find((b) => b.review) ?? null;
  const reviewable = myTrips.find((b) => statusOf(b) === "completed" && !b.review) ?? null;
  const stayingSoon = myTrips.find((b) => statusOf(b) === "upcoming" || statusOf(b) === "staying") ?? null;
  type ShownReview = (typeof hotel.guestReviews)[number] & { mine?: boolean };
  const myAuthor = `${user?.firstName ?? "You"} ${user?.lastName?.charAt(0) ?? ""}.`;
  const shownReviews: ShownReview[] = myReviewed?.review
    ? [
        {
          name: myAuthor,
          country: "Your verified stay",
          trip: "Your review",
          title: myReviewed.review.title,
          text: myReviewed.review.text,
          score: myReviewed.review.score,
          monthsAgo: 0,
          mine: true,
        },
        ...hotel.guestReviews.filter((r) => r.name !== myAuthor),
      ]
    : hotel.guestReviews;

  const q = stayQuery({ ...stay, dest: hotel.cityId });
  const setStay = (s: Stay) => navigate(`/hotel/${hotel.id}?${stayQuery({ ...s, dest: hotel.cityId })}`, { replace: true });

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-15% 0px -75% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: hotel.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const bookCard = (
    <div className="rounded-3xl border border-sand-200 bg-white p-5 shadow-soft">
      <div className="flex items-end justify-between gap-3">
        <p className="leading-none">
          <span className="text-sm text-ink-500">From </span>
          <span className="text-[2rem] font-bold tracking-tight tabular-nums">{money(hotel.price)}</span>
          <span className="text-sm text-ink-500"> / night</span>
        </p>
        {hotel.deal > 0 && <DealTag deal={hotel.deal} />}
      </div>
      <p className="mt-2 text-sm text-ink-500">
        {hotel.wasPrice && <s className="mr-1.5">{money(hotel.wasPrice * mult)}</s>}
        <span className="font-semibold text-ink">{money(hotel.price * mult)}</span> for {plural(nights, "night")}
        {stay.rooms > 1 && `, ${stay.rooms} rooms`} · taxes &amp; fees included
      </p>
      <div className="mt-4">
        <SearchBar key={q} initial={stay} variant="stacked" hideDest autoSubmit onSubmit={setStay} />
      </div>
      <button type="button" onClick={() => jump("rooms")} className={btnClass("primary", "lg", "mt-3 w-full")}>
        Choose your room
      </button>
      <ul className="mt-4 space-y-2 text-sm">
        <Perk ok={hotel.flex}>{hotel.flex ? `Free cancellation until ${fmtMed(cancelBy)} on flexible rates` : "Non-refundable rates only at this property"}</Perk>
        <Perk ok>No booking fees — ever</Perk>
        <Perk ok>You won't be charged until you confirm</Perk>
      </ul>
    </div>
  );

  return (
    <>
      <Header sticky={false} />
      <main className="pb-24 lg:pb-0">
        <div className="container-x pt-5">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link to={`/search?${stayQuery({ ...stay, dest: "" })}`} className="hover:text-ink hover:underline">
                  All stays
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link to={`/search?${q}`} className="hover:text-ink hover:underline">
                  {city.name}
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="text-ink" aria-current="page">
                {hotel.name}
              </li>
            </ol>
          </nav>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="eyebrow text-pine-600">{hotel.type}</span>
                <Stars n={hotel.stars} />
              </div>
              <h1 className="display mt-2 text-[clamp(2.3rem,5.4vw,4rem)] leading-[1]">{hotel.name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <RatingBadge rating={hotel.rating} reviews={hotel.reviews} />
                <button type="button" onClick={() => jump("location")} className="flex items-center gap-1.5 text-sm text-ink-700 underline-offset-4 hover:underline">
                  <MapPin className="size-4 text-ink-400" aria-hidden />
                  {hotel.area}, {city.name} · {hotel.distance} km from {city.centre}
                </button>
                {stayingSoon && (
                  <Link
                    to={`/account/bookings/${stayingSoon.ref}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-pine-50 px-3 py-1 text-sm font-semibold text-pine-700 hover:bg-pine-100"
                  >
                    You're staying here {fmtMed(stayingSoon.checkIn)}
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={share} className={btnClass("outline", "sm")}>
                {copied ? <CheckIcon className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
                <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
              </button>
              <SaveButton id={hotel.id} name={hotel.name} labelled />
            </div>
          </div>

          <div className="mt-6">
            <Gallery hotel={hotel} onOpen={setLightbox} />
          </div>
        </div>

        {/* section nav */}
        <div className="sticky top-0 z-20 mt-8 border-y border-sand-200 bg-paper">
          <div className="container-x flex items-center justify-between gap-4">
            <nav aria-label="On this page" className="no-scrollbar -mx-2 flex overflow-x-auto">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={active === s.id}
                  className={cn(
                    "relative shrink-0 px-3.5 py-4 text-sm font-semibold transition-colors",
                    active === s.id ? "text-ink after:absolute after:inset-x-3.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink" : "text-ink-500 hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </nav>
            <div className="hidden items-center gap-4 lg:flex">
              <p className="text-sm">
                <span className="font-bold tabular-nums">{money(hotel.price)}</span>
                <span className="text-ink-500"> / night</span>
              </p>
              <button type="button" onClick={() => jump("rooms")} className={btnClass("primary", "sm")}>
                Choose room
              </button>
            </div>
          </div>
        </div>

        <div className="container-x mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-16">
            {/* Overview */}
            <section id="overview" className="scroll-mt-20">
              <p className="display text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.25]">{hotel.blurb}</p>
              <p className="mt-5 max-w-2xl leading-relaxed text-ink-700">
                {hotel.name} is a {hotel.stars}-star {hotel.type.toLowerCase()} in {hotel.area}, {hotel.distance} km from {city.centre}.{" "}
                {nearby[0] && `${nearby[0].name} is a ${nearby[0].time} away. `}
                Guests rate it {hotel.rating.toFixed(1)} out of 10 across {num(hotel.reviews)} verified stays, with {hotel.scores[0].label.toLowerCase()} scoring{" "}
                {hotel.scores[0].value.toFixed(1)}.
              </p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  {
                    icon: hotel.flex ? CheckIcon : Ban,
                    title: hotel.flex ? "Free cancellation" : "Non-refundable",
                    text: hotel.flex ? `Until ${fmtMed(cancelBy)} on flexible rates` : "Lower prices, fixed dates",
                  },
                  {
                    icon: Coffee,
                    title: hotel.breakfast === "included" ? "Breakfast included" : hotel.breakfast === "optional" ? "Breakfast available" : "Self-catering",
                    text: hotel.breakfast === "included" ? "In every rate, every morning" : hotel.breakfast === "optional" ? "Add it to any room when you book" : "Kitchen in every unit",
                  },
                  { icon: Clock, title: `Check-in from ${hotel.checkInTime}`, text: `Check-out until ${hotel.checkOutTime}` },
                ].map((f) => (
                  <li key={f.title} className="rounded-2xl border border-sand-200 bg-white p-4">
                    <f.icon className="size-5 text-pine-600" aria-hidden />
                    <p className="mt-3 font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-sm text-ink-500">{f.text}</p>
                  </li>
                ))}
              </ul>
            </section>

            {!isLg && bookCard}

            {/* Rooms */}
            <section id="rooms" className="scroll-mt-20">
              <SectionTitle
                sub={
                  <>
                    {fmtMed(stay.checkIn)} – {fmtMed(stay.checkOut)} · {plural(guestsOf(stay), "guest")}, {plural(stay.rooms, "room")}. Prices are per room, per night, with taxes and fees included.
                  </>
                }
              >
                Choose your room
              </SectionTitle>
              <div className="space-y-5">
                {hotel.rooms.map((room, i) => (
                  <RoomCard key={room.name} hotel={hotel} room={room} index={i} stay={stay} cancelBy={cancelBy} />
                ))}
              </div>
            </section>

            {/* Amenities */}
            <section id="amenities" className="scroll-mt-20">
              <SectionTitle>What's here</SectionTitle>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {hotel.amenities.map((k) => {
                  const Icon = AMENITY_ICONS[k];
                  return (
                    <li key={k} className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sand-100">
                        <Icon className="size-5 text-ink-700" strokeWidth={1.7} aria-hidden />
                      </span>
                      {getAmenityLabel(k)}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Reviews */}
            <section id="reviews" className="scroll-mt-20">
              <SectionTitle sub="Only guests who have completed a stay can review.">What guests say</SectionTitle>
              <div className="grid gap-8 rounded-3xl bg-sand-50 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-12 sm:p-8">
                <div>
                  <p className="display text-7xl leading-none tabular-nums">{hotel.rating.toFixed(1)}</p>
                  <p className="mt-2 text-lg font-semibold">{ratingLabel(hotel.rating)}</p>
                  <p className="text-sm text-ink-500">{num(hotel.reviews)} verified reviews</p>
                </div>
                <dl className="grid gap-3">
                  {hotel.scores.map((s) => (
                    <div key={s.label} className="grid grid-cols-[6.5rem_1fr_2.25rem] items-center gap-3 text-sm">
                      <dt>{s.label}</dt>
                      <dd className="h-2 overflow-hidden rounded-full bg-sand-200" aria-hidden>
                        <span className="block h-full rounded-full bg-pine-600" style={{ width: `${s.value * 10}%` }} />
                      </dd>
                      <dd className="text-right font-semibold tabular-nums">{s.value.toFixed(1)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {reviewable && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-pine-200 bg-pine-50/60 p-4">
                  <p className="text-sm text-ink-700">
                    <span className="font-semibold">You stayed here in {fmtMed(reviewable.checkIn)}.</span> Tell the next guest how it was — it takes a minute.
                  </p>
                  <Link to={`/account/bookings/${reviewable.ref}?review=1`} className={btnClass("dark", "sm")}>
                    Write a review
                  </Link>
                </div>
              )}
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {shownReviews.map((r) => (
                  <li key={r.name} className="rounded-3xl border border-sand-200 bg-white p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-full bg-pine-100 font-semibold text-pine-700" aria-hidden>
                        {r.name[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-tight">{r.name}</p>
                        <p className="truncate text-xs text-ink-500">
                          {r.country} · {r.trip}
                        </p>
                      </div>
                      <span className="rounded-lg bg-sand-100 px-2 py-1 text-sm font-bold tabular-nums" aria-label={`Scored ${r.score} out of 10`}>
                        {r.score}
                      </span>
                    </div>
                    <p className="display mt-4 text-xl leading-snug">“{r.title}”</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-ink-700">{r.text}</p>
                    <p className="mt-3 text-xs text-ink-400">
                      {r.mine ? <span className="font-semibold text-pine-600">Your review · posted recently</span> : `Stayed ${monthsAgo(r.monthsAgo)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            {/* Location */}
            <section id="location" className="scroll-mt-20">
              <SectionTitle sub={`${hotel.area}, ${city.name}, ${city.country}`}>Where you'll be</SectionTitle>
              <div className="overflow-hidden rounded-3xl border border-sand-200">
                <MapView pins={[{ id: hotel.id, lat: hotel.lat, lng: hotel.lng, label: hotel.name, title: hotel.name }]} activeId={hotel.id} interactive={false} className="h-80" />
              </div>
              <ul className="mt-5 grid gap-x-10 sm:grid-cols-2">
                {nearby.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-4 border-b border-sand-200 py-3 text-[15px]">
                    <span>{p.name}</span>
                    <span className="shrink-0 text-sm text-ink-500">{p.time}</span>
                  </li>
                ))}
              </ul>
              <a
                href={`https://www.openstreetmap.org/?mlat=${hotel.lat}&mlon=${hotel.lng}#map=16/${hotel.lat}/${hotel.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-pine-600 hover:underline"
              >
                Open in OpenStreetMap
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            </section>

            {/* Policies */}
            <section id="policies" className="scroll-mt-20">
              <SectionTitle>Good to know</SectionTitle>
              <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                {[
                  ["Check-in", `From ${hotel.checkInTime}. Bring photo ID and the card you booked with.`],
                  ["Check-out", `Until ${hotel.checkOutTime}. Late check-out until 2 pm can be added when you book.`],
                  [
                    "Cancellation",
                    hotel.flex
                      ? "Flexible rates: free to cancel until 6 pm, two days before arrival. Saver rates can't be refunded."
                      : "This property only offers non-refundable rates. Dates can't be changed after booking.",
                  ],
                  [
                    "Children & pets",
                    `Children of all ages are welcome${hotel.amenities.includes("family") ? ", and cots are free on request" : ""}. ${
                      hotel.amenities.includes("pets") ? "Pets stay free — let the property know in advance." : "Pets aren't allowed."
                    }`,
                  ],
                ].map(([term, text]) => (
                  <div key={term} className="border-t border-sand-200 pt-4">
                    <dt className="font-semibold">{term}</dt>
                    <dd className="mt-1 text-[15px] leading-relaxed text-ink-700">{text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          {isLg && (
            <aside aria-label="Book this stay">
              <div className="sticky top-20">{bookCard}</div>
            </aside>
          )}
        </div>

        {similar.length > 0 && (
          <section className="container-x mt-20">
            <SectionTitle sub="Closest in price to this one.">More stays in {city.name}</SectionTitle>
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((h) => (
                <StayCard key={h.id} hotel={h} stay={stay} showCity={false} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* phones: persistent CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="leading-tight">
              <span className="text-xl font-bold tabular-nums">{money(hotel.price)}</span>
              <span className="text-sm text-ink-500"> / night</span>
            </p>
            <p className="text-xs text-ink-500">
              {money(hotel.price * mult)} total · {fmtMed(stay.checkIn).split(", ")[1]} – {fmtMed(stay.checkOut).split(", ")[1]}
            </p>
          </div>
          <button type="button" onClick={() => jump("rooms")} className={btnClass("primary", "md")}>
            Choose room
          </button>
        </div>
      </div>

      <Lightbox hotel={hotel} index={lightbox} setIndex={setLightbox} />
      <Footer />
    </>
  );
}

export default function PropertyPage({ id, query }: { id: string | undefined; query: URLSearchParams }) {
  const hotel = getHotel(id);
  const stay = useMemo(() => parseStay(query), [query]);
  if (!hotel) return <NotFound title="We can't find that stay" />;
  return <PropertyView key={hotel.id} initialHotel={hotel} stay={stay} />;
}
