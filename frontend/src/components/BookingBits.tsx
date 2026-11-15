import { ArrowRight, Check as CheckIcon, MessageSquare, Receipt, Star, Wallet } from "lucide-react";
import { cn } from "../utils/cn";
import { getCity, getHotel } from "../data/hotels";
import {
  STATUS_LABEL, balanceDue, canReview, nightsUntil, paidOf, statusOf, unreadFrom, useAccount, type Booking, type TripStatus,
} from "../lib/account";
import { fmtMed } from "../lib/dates";
import { money, plural } from "../lib/format";
import { Link } from "../lib/router";
import { Img, Stars, btnClass } from "./ui";

export const STATUS_STYLE: Record<TripStatus, string> = {
  upcoming: "bg-pine-50 text-pine-700",
  staying: "bg-gold/15 text-[#7a5a12]",
  completed: "bg-sand-100 text-ink-700",
  cancelled: "bg-sand-100 text-ink-500",
};

export function StatusPill({ status, className }: { status: TripStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", STATUS_STYLE[status], className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "upcoming" && "bg-pine-600",
          status === "staying" && "bg-gold",
          status === "completed" && "bg-ink-400",
          status === "cancelled" && "bg-ink-300",
        )}
        aria-hidden
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** One row in "My trips". */
export function BookingRow({ booking }: { booking: Booking }) {
  const hotel = getHotel(booking.hotelId);
  const { threads } = useAccount();
  if (!hotel) return null;
  const city = getCity(hotel.cityId);
  const status = statusOf(booking);
  const due = balanceDue(booking);
  const refund = booking.refundAmount;
  const unread = unreadFrom(threads, booking.ref);
  const days = nightsUntil(booking);
  const detail = `/account/bookings/${booking.ref}`;

  return (
    <article className="grid overflow-hidden rounded-3xl border border-sand-200 bg-white sm:grid-cols-[10.5rem_1fr]">
      <div className="relative h-40 sm:h-full">
        <Img id={hotel.images[0].id} w={360} h={300} alt="" className="size-full" />
        <span className="absolute left-2.5 top-2.5">
          <StatusPill status={status} className="shadow-soft" />
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-4 p-5 lg:flex-row">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
            <span className="font-mono font-semibold tracking-wide text-ink-700">{booking.ref}</span>
            {booking.sample && <span className="rounded-full bg-sand-100 px-1.5 py-0.5 font-semibold">Sample</span>}
          </p>
          <h3 className="display mt-1 text-[1.35rem] leading-tight">
            <Link to={detail} className="rounded">
              {hotel.name}
            </Link>
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink-500">
            {hotel.area}, {city.name}
            <span aria-hidden>·</span>
            <Stars n={hotel.stars} />
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">{fmtMed(booking.checkIn)}</span>
            <span className="text-ink-500"> → </span>
            <span className="font-semibold">{fmtMed(booking.checkOut)}</span>
            <span className="text-ink-500">
              {" "}
              · {plural(booking.nights, "night")} · {plural(booking.adults + booking.children, "guest")}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-ink-500">
            {booking.roomName} · {booking.rateName}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status === "upcoming" && days >= 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-pine-700">
                {days === 0 ? "Checking in today" : `In ${plural(days, "day")}`}
              </span>
            )}
            {booking.requests.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2 py-1 text-xs font-medium text-ink-700">
                <Receipt className="size-3" aria-hidden />
                {plural(booking.requests.length, "request")}
              </span>
            )}
            {unread > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ember-50 px-2 py-1 text-xs font-semibold text-ember-700">
                <MessageSquare className="size-3" aria-hidden />
                New reply
              </span>
            )}
            {booking.review && (
              <span className="inline-flex items-center gap-1 rounded-full bg-pine-50 px-2 py-1 text-xs font-semibold text-pine-700">
                <Star className="size-3 fill-pine-600 text-pine-600" aria-hidden />
                Reviewed {booking.review.score.toFixed(1)}
              </span>
            )}
            {status === "cancelled" && refund > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-500">{money(refund)} refunded</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-sand-200 pt-4 lg:w-40 lg:items-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 lg:text-right">
          <div className="lg:text-right">
            <p className="text-xs text-ink-500">{status === "cancelled" ? "Booking total" : due > 0 ? "Balance due" : "Total paid"}</p>
            <p className="text-xl font-bold tabular-nums">{money(status === "cancelled" ? booking.total : due > 0 ? due : paidOf(booking))}</p>
            <p className="text-xs text-ink-500">{due > 0 ? `of ${money(booking.total)}` : "Taxes & fees included"}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
            {due > 0 && status !== "cancelled" && (
              <Link to={`${detail}?pay=1`} className={btnClass("primary", "sm")}>
                <Wallet className="size-4" aria-hidden />
                Pay balance
              </Link>
            )}
            {canReview(booking) && (
              <Link to={`${detail}?review=1`} className={btnClass("dark", "sm")}>
                <Star className="size-4" aria-hidden />
                Write a review
              </Link>
            )}
            <Link to={detail} className={btnClass(due > 0 || canReview(booking) ? "outline" : "dark", "sm")}>
              View trip
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export function SampleNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-dashed border-sand-300 bg-sand-50 p-4 text-sm">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-pine-600">
        <CheckIcon className="size-4" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-ink-700">
        <span className="font-semibold">Five sample trips are loaded.</span> Use them to try paying a balance, updating
        special requests, messaging a host or writing a review. Your own bookings will appear alongside them.
      </p>
      <button type="button" onClick={onDismiss} className="font-semibold text-pine-600 hover:underline">
        Got it
      </button>
    </div>
  );
}
