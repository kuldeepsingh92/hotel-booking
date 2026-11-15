import { useState } from "react";
import { ArrowRight, Check as CheckIcon, ChevronLeft, ChevronRight, Coffee, MapPin, Tag } from "lucide-react";
import { cn } from "../utils/cn";
import { getAmenityLabel, getCity, type Hotel } from "../data/hotels";
import { money, plural } from "../lib/format";
import { Link } from "../lib/router";
import { nightsOf, stayQuery, type Stay } from "../lib/stay";
import { AMENITY_ICONS, Img, RatingBadge, SaveButton, ScoreChip, Stars } from "./ui";
import type { Coupon } from "../lib/pricing";
import type { ReactNode } from "react";

export type PriceMode = "night" | "total";

export function DealTag({ deal, className }: { deal: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-ember-600 px-2.5 py-1 text-xs font-bold text-white", className)}>
      <Tag className="size-3" aria-hidden />
      {deal}% off
    </span>
  );
}

/* ───────── vertical card (home, similar stays) ───────── */

export function StayCard({ hotel, stay, showCity = true }: { hotel: Hotel; stay: Stay; showCity?: boolean }) {
  const city = getCity(hotel.cityId);
  return (
    <article className="group relative flex flex-col">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-sand-100">
        <Img
          id={hotel.images[0].id}
          w={640}
          h={480}
          alt=""
          className="size-full transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        {hotel.deal > 0 && <DealTag deal={hotel.deal} className="absolute left-3 top-3" />}
        <SaveButton id={hotel.id} name={hotel.name} className="absolute right-3 top-3 z-10" />
      </div>
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">{hotel.type}</p>
          <h3 className="display mt-1 text-[1.35rem] leading-tight">
            <Link to={`/hotel/${hotel.id}?${stayQuery({ ...stay, dest: hotel.cityId })}`} className="rounded after:absolute after:inset-0">
              {hotel.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-sm text-ink-500">
            {hotel.area}
            {showCity && `, ${city.name}`}
          </p>
        </div>
        <ScoreChip rating={hotel.rating} />
      </div>
      <p className="mt-2 text-[15px]">
        {hotel.wasPrice && <s className="mr-1.5 text-ink-400">{money(hotel.wasPrice)}</s>}
        <span className="font-bold tabular-nums">{money(hotel.price)}</span>
        <span className="text-ink-500"> / night, taxes included</span>
      </p>
    </article>
  );
}

/* ───────── horizontal result card (search) ───────── */

function Carousel({ hotel }: { hotel: Hotel }) {
  const imgs = hotel.images.slice(0, 5);
  const [i, setI] = useState(0);
  const go = (d: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setI((v) => (v + d + imgs.length) % imgs.length);
  };
  const arrow =
    "absolute top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-ink opacity-0 shadow-soft transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100";
  return (
    <div className="relative size-full min-h-52 overflow-hidden bg-sand-100">
      <Img id={imgs[i].id} w={560} h={440} alt={`${hotel.name} — ${imgs[i].label.toLowerCase()}`} className="absolute inset-0 size-full" />
      <button type="button" onClick={go(-1)} className={cn(arrow, "left-2.5")} aria-label="Previous photo">
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={go(1)} className={cn(arrow, "right-2.5")} aria-label="Next photo">
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/35 to-transparent pb-3 pt-8" aria-hidden>
        {imgs.map((_, d) => (
          <span key={d} className={cn("size-1.5 rounded-full transition-all", d === i ? "scale-125 bg-white" : "bg-white/55")} />
        ))}
      </div>
      {hotel.deal > 0 && <DealTag deal={hotel.deal} className="absolute left-3 top-3" />}
      <SaveButton id={hotel.id} name={hotel.name} className="absolute right-3 top-3 z-10" />
    </div>
  );
}

function Pill({ children, tone = "pine" }: { children: ReactNode; tone?: "pine" | "sand" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "pine" ? "bg-pine-50 text-pine-700" : "bg-sand-100 text-ink-700",
      )}
    >
      {children}
    </span>
  );
}

export function ResultCard({
  hotel, stay, mode, compact, active, onHover,
}: {
  hotel: Hotel;
  stay: Stay;
  mode: PriceMode;
  compact?: boolean;
  active?: boolean;
  onHover?: (id: string | null) => void;
}) {
  const city = getCity(hotel.cityId);
  const nights = nightsOf(stay);
  const mult = nights * stay.rooms;
  const total = hotel.price * mult;
  const big = mode === "night" ? hotel.price : total;
  const was = hotel.wasPrice ? (mode === "night" ? hotel.wasPrice : hotel.wasPrice * mult) : null;

  return (
    <article
      id={`card-${hotel.id}`}
      onMouseEnter={() => onHover?.(hotel.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "group relative grid overflow-hidden rounded-3xl border bg-white transition-[box-shadow,border-color] duration-200 hover:shadow-lift",
        compact ? "sm:grid-cols-[12.5rem_1fr]" : "sm:grid-cols-[16.5rem_1fr]",
        active ? "border-ink shadow-lift" : "border-sand-200",
      )}
    >
      <Carousel hotel={hotel} />

      <div className={cn("flex flex-col gap-4 p-5", !compact && "lg:flex-row lg:gap-5")}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-ink-500">{hotel.type}</span>
            <Stars n={hotel.stars} />
          </div>
          <h3 className={cn("display mt-1.5 leading-[1.1]", compact ? "text-[1.4rem]" : "text-[1.65rem]")}>
            <Link to={`/hotel/${hotel.id}?${stayQuery({ ...stay, dest: hotel.cityId })}`} className="rounded after:absolute after:inset-0">
              {hotel.name}
            </Link>
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {hotel.area}
              {!stay.dest && `, ${city.name}`} · {hotel.distance} km from {city.centre}
            </span>
          </p>
          <RatingBadge rating={hotel.rating} reviews={hotel.reviews} className="mt-3.5" />
          {!compact && (
            <ul className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-700">
              {hotel.highlights.map((k) => {
                const Icon = AMENITY_ICONS[k];
                return (
                  <li key={k} className="flex items-center gap-1.5">
                    <Icon className="size-4 text-ink-400" aria-hidden />
                    {getAmenityLabel(k)}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {hotel.flex && (
              <Pill>
                <CheckIcon className="size-3.5" aria-hidden />
                Free cancellation
              </Pill>
            )}
            {hotel.breakfast === "included" && (
              <Pill>
                <Coffee className="size-3.5" aria-hidden />
                Breakfast included
              </Pill>
            )}
            {hotel.flex && !compact && <Pill tone="sand">Pay at the property</Pill>}
          </div>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-end justify-between gap-4 border-t border-sand-200 pt-4",
            !compact && "lg:w-44 lg:flex-col lg:items-end lg:justify-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 lg:text-right",
          )}
        >
          <div>
            {was && <s className="block text-sm tabular-nums text-ink-400">{money(was)}</s>}
            <p className="leading-none">
              <span className="text-[1.65rem] font-bold tracking-tight tabular-nums">{money(big)}</span>
              <span className="text-sm text-ink-500"> {mode === "night" ? "/ night" : "total"}</span>
            </p>
            <p className="mt-1.5 text-xs leading-snug text-ink-500">
              {mode === "night" ? `${money(total)} for ${plural(nights, "night")}` : `${money(hotel.price)} / night`}
              <br />
              Taxes &amp; fees included
            </p>
          </div>
          <span
            aria-hidden
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-pine-600 px-4 text-sm font-semibold text-white transition-colors group-hover:bg-pine-700"
          >
            See rooms
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

/* ───────── coupon ticket (home offers, checkout) ───────── */

export function CouponTicket({
  coupon, children, notch = "bg-paper", muted, className,
}: {
  coupon: Coupon;
  children: ReactNode;
  /** Background colour of the surface behind the ticket, so the notches read as cut-outs. */
  notch?: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative flex overflow-hidden rounded-2xl", className)}>
      <div
        className={cn(
          "flex w-[6.5rem] shrink-0 flex-col items-center justify-center gap-1 px-2 py-4 text-center",
          muted ? "bg-sand-200 text-ink-500" : "bg-pine-600 text-white",
        )}
      >
        <span className="display text-[1.7rem] leading-none">{coupon.headline.split(" ")[0]}</span>
        <span className="eyebrow opacity-80">off</span>
      </div>
      <span className={cn("absolute -top-2 left-[6.5rem] size-4 -translate-x-1/2 rounded-full", notch)} aria-hidden />
      <span className={cn("absolute -bottom-2 left-[6.5rem] size-4 -translate-x-1/2 rounded-full", notch)} aria-hidden />
      <div className="min-w-0 flex-1 border-l border-dashed border-sand-300 p-4">{children}</div>
    </div>
  );
}
