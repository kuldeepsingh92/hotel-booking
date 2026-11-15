import { useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import {
  ArrowLeft, Ban, Check as CheckIcon, ChevronDown, CircleAlert, Coffee, CreditCard, Info, LoaderCircle, Lock, Plus,
} from "lucide-react";
import { cn } from "../utils/cn";
import { getCity, getHotel, type Hotel, type RatePlan, type Room } from "../data/hotels";
import { createBooking, useAccount } from "../lib/account";
import { evaluateCouponApi, useCatalog } from "../lib/catalog";
import { cardBrand, digits, expiryError, formatCard, formatExp, luhn } from "../lib/payment";
import { fmtLong, fmtMed, freeCancelUntil } from "../lib/dates";
import { clamp, money, plural } from "../lib/format";
import {
  addonAmount, bestCoupon, buildQuote, evaluateCoupon, findCoupon, getAddon, type AddonId, type CouponContext,
} from "../lib/pricing";
import { Link, navigate } from "../lib/router";
import { guestsLabel, guestsOf, nightsOf, parseStay, stayQuery, type Stay } from "../lib/stay";
import { saveLastBookingRef } from "../lib/store";
import { Header } from "../components/Header";
import { CouponTicket } from "../components/HotelCard";
import { Img, RatingBadge, btnClass } from "../components/ui";
import NotFound from "./NotFound";

/* ───────── form primitives ───────── */

type FieldId = "firstName" | "lastName" | "email" | "phone" | "cardNumber" | "cardName" | "cardExp" | "cardCvc";
type Method = "upi" | "card" | "netbanking";

const GUEST_FIELDS: FieldId[] = ["firstName", "lastName", "email", "phone"];
const CARD_FIELDS: FieldId[] = ["cardNumber", "cardName", "cardExp", "cardCvc"];

function TextField({
  id, label, error, hint, trailing, className, ...input
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn("field", trailing ? "pr-24" : undefined)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          {...input}
        />
        {trailing && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Step({ n, title, sub, children, id }: { n: number; title: string; sub?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-3xl border border-sand-200 bg-white p-5 sm:p-7">
      <header className="flex items-start gap-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold tabular-nums text-white" aria-hidden>
          {n}
        </span>
        <div>
          <h2 className="display text-[1.6rem] leading-tight">{title}</h2>
          {sub && <p className="mt-1 text-sm text-ink-500">{sub}</p>}
        </div>
      </header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A radio rendered as a selectable card. */
function RadioCard({
  name, value, checked, onChange, title, sub, aside, children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border transition-colors", checked ? "border-pine-600 bg-pine-50/50 ring-1 ring-pine-600" : "border-sand-300 bg-white hover:border-ink-400")}>
      <label className="flex cursor-pointer items-center gap-3.5 p-4">
        <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="peer sr-only" />
        <span
          aria-hidden
          className="grid size-5 shrink-0 place-items-center rounded-full border border-sand-300 bg-white peer-checked:border-pine-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine-600 [&>span]:scale-0 peer-checked:[&>span]:scale-100"
        >
          <span className="size-2.5 rounded-full bg-pine-600 transition-transform" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {sub && <span className="block text-sm text-ink-500">{sub}</span>}
        </span>
        {aside}
      </label>
      {checked && children && <div className="animate-fade border-t border-pine-600/20 p-4">{children}</div>}
    </div>
  );
}

function Mark({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("grid h-6 min-w-10 place-items-center rounded-md border border-sand-300 bg-white px-1.5 text-[10px] font-bold tracking-wide text-ink-700", className)}>
      {children}
    </span>
  );
}

/* ───────── checkout ───────── */

function Checkout({ hotel, room, roomIndex, rate, stay }: { hotel: Hotel; room: Room; roomIndex: number; rate: RatePlan; stay: Stay }) {
  const city = getCity(hotel.cityId);
  const nights = nightsOf(stay);
  const guests = guestsOf(stay);
  const cancelBy = freeCancelUntil(stay.checkIn);
  const backTo = `/hotel/${hotel.id}?${stayQuery({ ...stay, dest: hotel.cityId })}`;

  const { coupons, meta } = useCatalog();
  const specialRequests = meta?.specialRequests ?? [];
  const banks = meta?.banks ?? [];
  const { user: account } = useAccount();

  const [form, setForm] = useState<Record<FieldId, string>>({
    firstName: account?.firstName ?? "",
    lastName: account?.lastName ?? "",
    email: account?.email ?? "",
    phone: account?.phone ?? "",
    cardNumber: "", cardName: "", cardExp: "", cardCvc: "",
  });
  const [touched, setTouched] = useState<Partial<Record<FieldId, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [arrival, setArrival] = useState("");
  const [requests, setRequests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [addons, setAddons] = useState<AddonId[]>([]);

  const [applied, setApplied] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [couponError, setCouponError] = useState("");

  const [payWhen, setPayWhen] = useState<"now" | "later">("now");
  const [method, setMethod] = useState<Method>("upi");
  const [upiId, setUpiId] = useState("");
  const [selectedBank, setSelectedBank] = useState(banks[0] ?? "HDFC Bank");
  const [summaryOpen, setSummaryOpen] = useState(false);

  const payLater = rate.payAtProperty && payWhen === "later";
  const needCard = payLater || method === "card";

  /* pricing */
  const ctx: CouponContext = useMemo(
    () => ({ roomTotal: rate.price * nights * stay.rooms, nights, checkIn: stay.checkIn, checkOut: stay.checkOut }),
    [rate.price, nights, stay.rooms, stay.checkIn, stay.checkOut],
  );
  const coupon = applied ? findCoupon(applied) : null;
  const discount = coupon ? evaluateCoupon(coupon, ctx).discount : 0;
  const best = useMemo(() => bestCoupon(ctx), [ctx]);
  const quote = buildQuote({ nightly: rate.price, nights, rooms: stay.rooms, guests, addons, discount, payLater });

  const availableAddons: AddonId[] = [
    ...(hotel.breakfast === "optional" && !rate.breakfast ? (["breakfast"] as AddonId[]) : []),
    "transfer",
    "late",
  ];

  /* validation */
  const cardDigits = digits(form.cardNumber);
  const brand = cardBrand(cardDigits);
  const cvcLength = brand === "Amex" ? 4 : 3;

  const errors = useMemo(() => {
    const e: Partial<Record<FieldId, string>> = {};
    if (!form.firstName.trim()) e.firstName = "Enter the first name as it appears on the guest's ID.";
    if (!form.lastName.trim()) e.lastName = "Enter the last name as it appears on the guest's ID.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      e.email = form.email.trim() ? "That email doesn't look complete — it should be like name@example.com." : "Enter an email so we can send your confirmation.";
    }
    if (digits(form.phone).length < 7) e.phone = "Enter a phone number with country code, so the property can reach you on arrival day.";
    if (needCard) {
      if (!cardDigits) e.cardNumber = "Enter your card number.";
      else if (!luhn(cardDigits)) e.cardNumber = "That card number doesn't add up. Check the digits and try again.";
      if (!form.cardName.trim()) e.cardName = "Enter the name printed on the card.";
      const exp = expiryError(form.cardExp);
      if (exp) e.cardExp = exp;
      if (digits(form.cardCvc).length !== cvcLength) e.cardCvc = `Enter the ${cvcLength}-digit code ${brand === "Amex" ? "on the front" : "on the back"} of the card.`;
    }
    return e;
  }, [form, needCard, cardDigits, cvcLength, brand]);

  const activeFields = needCard ? [...GUEST_FIELDS, ...CARD_FIELDS] : GUEST_FIELDS;
  const errorCount = activeFields.filter((k) => errors[k]).length;
  const err = (k: FieldId) => (touched[k] || submitted ? errors[k] : undefined);
  const bind = (k: FieldId, format?: (v: string) => string) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: format ? format(e.target.value) : e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    error: err(k),
  });

  /* coupons — verified live against Redis via Spring Boot */
  const applyCoupon = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) return setCouponError("Type a code first — or pick one from the list below.");
    try {
      const res = await evaluateCouponApi({
        code,
        roomTotal: ctx.roomTotal,
        nights: ctx.nights,
        checkIn: ctx.checkIn,
        checkOut: ctx.checkOut,
      });
      if (!res.ok || !res.coupon) {
        return setCouponError(res.reason || `${code} can't be used on this booking.`);
      }
      setApplied(res.coupon.code);
      setCouponError("");
      setCodeInput("");
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : "Could not validate coupon right now.");
    }
  };

  /* submit — persists booking directly to Redis via POST /api/v1/bookings */
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (processing) return;
    setSubmitted(true);
    setSubmitError("");
    const firstBad = activeFields.find((k) => errors[k]);
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    setProcessing(true);
    const cardLabel = `${brand ?? "Card"} ending ${cardDigits.slice(-4)}`;
    const payment = payLater
      ? `${cardLabel} (held as guarantee, pay at hotel)`
      : method === "upi"
        ? (upiId.trim() ? `UPI (${upiId.trim()})` : "UPI (Google Pay / PhonePe)")
        : method === "netbanking"
          ? `NetBanking (${selectedBank})`
          : cardLabel;

    try {
      const created = await createBooking({
        hotelId: hotel.id,
        roomIndex,
        rateId: rate.id,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        adults: stay.adults,
        children: stay.children,
        rooms: stay.rooms,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        arrival,
        requests,
        notes: notes.trim(),
        addonIds: addons,
        couponCode: applied,
        payLater,
        paymentMethod: payLater ? "Pay at the property" : payment,
      });
      saveLastBookingRef(created.ref);
      navigate("/confirmation");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not complete your booking. Please try again.");
      setProcessing(false);
    }
  };

  const ctaLabel = payLater
    ? "Confirm booking (Pay at Hotel)"
    : method === "upi"
      ? `Pay ${money(quote.total)} via UPI`
      : method === "netbanking"
        ? `Pay ${money(quote.total)} with NetBanking`
        : `Pay ${money(quote.total)} and confirm`;

  const cta = (extra?: string) => (
    <button type="submit" form="booking-form" disabled={processing} className={btnClass("primary", "lg", cn("disabled:opacity-80", extra))}>
      {processing ? (
        <>
          <LoaderCircle className="size-5 animate-spin" aria-hidden />
          Confirming your room…
        </>
      ) : (
        <>
          <Lock className="size-4" aria-hidden />
          {ctaLabel}
        </>
      )}
    </button>
  );

  const summary = (
    <div>
      <div className="flex gap-4">
        <Img id={hotel.images[0].id} w={200} h={200} alt="" className="size-24 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <p className="eyebrow text-ink-500">{hotel.type}</p>
          <p className="display mt-0.5 text-[1.35rem] leading-tight">{hotel.name}</p>
          <p className="mt-0.5 truncate text-sm text-ink-500">
            {hotel.area}, {city.name}
          </p>
          <RatingBadge rating={hotel.rating} className="mt-2 [&>span:first-child]:h-6 [&>span:first-child]:min-w-7 [&>span:first-child]:text-xs" />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-sand-200 bg-sand-200 text-sm">
        <div className="bg-white p-3.5">
          <dt className="text-xs text-ink-500">Check-in</dt>
          <dd className="mt-0.5 font-semibold">{fmtMed(stay.checkIn)}</dd>
          <dd className="text-xs text-ink-500">from {hotel.checkInTime}</dd>
        </div>
        <div className="bg-white p-3.5">
          <dt className="text-xs text-ink-500">Check-out</dt>
          <dd className="mt-0.5 font-semibold">{fmtMed(stay.checkOut)}</dd>
          <dd className="text-xs text-ink-500">until {hotel.checkOutTime}</dd>
        </div>
      </dl>

      <div className="mt-4 text-sm">
        <p className="font-semibold">
          {room.name}
          {stay.rooms > 1 && ` × ${stay.rooms}`}
        </p>
        <p className="text-ink-500">
          {rate.name} · {plural(nights, "night")} · {guestsLabel(stay)}
        </p>
        <ul className="mt-2.5 space-y-1.5">
          <li className="flex items-start gap-2">
            {rate.refundable ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-pine-600" aria-hidden /> : <Ban className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />}
            {rate.refundable ? `Free cancellation until ${fmtMed(cancelBy)}` : "Non-refundable"}
          </li>
          {(rate.breakfast || addons.includes("breakfast")) && (
            <li className="flex items-start gap-2">
              <Coffee className="mt-0.5 size-4 shrink-0 text-pine-600" aria-hidden />
              Breakfast included
            </li>
          )}
        </ul>
        <Link to={backTo} className="mt-3 inline-block font-semibold text-pine-600 hover:underline">
          Change room or dates
        </Link>
      </div>

      <dl className="mt-5 space-y-2.5 border-t border-sand-200 pt-5 text-[15px] tabular-nums">
        <div className="flex justify-between gap-4">
          <dt>
            {money(rate.price)} × {plural(nights, "night")}
            {stay.rooms > 1 && ` × ${stay.rooms} rooms`}
          </dt>
          <dd>{money(quote.roomTotal)}</dd>
        </div>
        {quote.addons.map((a) => (
          <div key={a.id} className="flex justify-between gap-4">
            <dt>{a.title}</dt>
            <dd>{money(a.amount)}</dd>
          </div>
        ))}
        {quote.discount > 0 && coupon && (
          <div className="flex justify-between gap-4 font-semibold text-pine-600">
            <dt>Coupon {coupon.code}</dt>
            <dd>−{money(quote.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 text-ink-500">
          <dt>Taxes &amp; fees</dt>
          <dd>Included</dd>
        </div>
        <div className="flex justify-between gap-4 text-ink-500">
          <dt>Booking fee</dt>
          <dd>$0</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t border-ink pt-4">
        <span className="font-semibold">Total</span>
        <span className="text-[2rem] font-bold leading-none tracking-tight tabular-nums" aria-live="polite">
          {money(quote.total)}
        </span>
      </div>
      <p className="mt-1.5 text-right text-xs text-ink-500">Includes {money(quote.taxes)} in taxes and fees</p>

      <dl className="mt-4 space-y-1.5 rounded-2xl bg-sand-50 p-4 text-sm tabular-nums">
        <div className="flex justify-between font-semibold">
          <dt>Due today</dt>
          <dd>{money(quote.dueNow)}</dd>
        </div>
        {quote.dueLater > 0 && (
          <div className="flex justify-between text-ink-500">
            <dt>Due at the property</dt>
            <dd>{money(quote.dueLater)}</dd>
          </div>
        )}
      </dl>

      {quote.discount === 0 && best && (
        <button
          type="button"
          onClick={() => applyCoupon(best.code)}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-pine-500 px-4 py-3 text-left text-sm transition-colors hover:bg-pine-50"
        >
          <span>
            <span className="font-semibold">{best.code}</span> would save you {money(evaluateCoupon(best, ctx).discount)}
          </span>
          <span className="font-semibold text-pine-600">Apply</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      <Header minimal />
      <main className="container-x pb-32 pt-6 lg:pb-20">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to {hotel.name}
        </Link>

        <ol className="mt-6 flex items-center gap-3 text-sm" aria-label="Booking progress">
          {["Choose room", "Details & payment", "Confirmation"].map((label, i) => (
            <li key={label} className="flex items-center gap-3" aria-current={i === 1 ? "step" : undefined}>
              {i > 0 && <span className={cn("h-px w-6 sm:w-10", i === 1 ? "bg-pine-600" : "bg-sand-300")} aria-hidden />}
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-bold",
                  i === 0 && "bg-pine-600 text-white",
                  i === 1 && "bg-ink text-white",
                  i === 2 && "border border-sand-300 text-ink-400",
                )}
              >
                {i === 0 ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn(i === 1 ? "font-semibold" : "text-ink-500", i !== 1 && "hidden sm:inline")}>{label}</span>
            </li>
          ))}
        </ol>

        <h1 className="display mt-6 text-[clamp(2.1rem,4.6vw,3.25rem)] leading-[1.03]">
          Nearly yours, <em className="font-light text-pine-600">just the details left.</em>
        </h1>

        <div className="mt-8 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_25rem]">
          {/* phones: collapsible summary first */}
          <div className="rounded-3xl border border-sand-200 bg-white lg:hidden">
            <button type="button" onClick={() => setSummaryOpen((o) => !o)} aria-expanded={summaryOpen} className="flex w-full items-center justify-between gap-4 p-4 text-left">
              <span>
                <span className="block font-semibold">{hotel.name}</span>
                <span className="block text-sm text-ink-500">
                  {fmtMed(stay.checkIn)} – {fmtMed(stay.checkOut)} · {room.name}
                </span>
              </span>
              <span className="flex items-center gap-2 font-bold tabular-nums">
                {money(quote.total)}
                <ChevronDown className={cn("size-5 text-ink-500 transition-transform", summaryOpen && "rotate-180")} aria-hidden />
              </span>
            </button>
            {summaryOpen && <div className="animate-fade border-t border-sand-200 p-4">{summary}</div>}
          </div>

          <form id="booking-form" noValidate onSubmit={onSubmit} className="min-w-0 space-y-5">
            {/* 1 — guest */}
            <Step n={1} title="Who's checking in?" sub="Use the name on the ID the guest will show at reception.">
              <div className={cn("mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-3.5 text-sm", account ? "bg-pine-50 text-pine-700" : "bg-sand-50 text-ink-700")}>
                {account ? (
                  <>
                    <CheckIcon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      Booking as <span className="font-semibold">{account.firstName} {account.lastName}</span>. This trip will appear in <span className="font-semibold">My trips</span>, where you can pay, message the property and review it.
                    </span>
                    <Link to="/account?tab=trips" className="font-semibold underline underline-offset-4">My trips</Link>
                  </>
                ) : (
                  <>
                    <Info className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      Checking out as a guest. <span className="font-semibold">Sign in or create an account</span> to keep this booking, message the property and write a review later.
                    </span>
                    <Link to={`/login?next=${encodeURIComponent(`/book/${hotel.id}?${stayQuery({ ...stay, dest: hotel.cityId })}&room=${roomIndex}&rate=${rate.id}`)}`} className="font-semibold underline underline-offset-4">
                      Sign in
                    </Link>
                  </>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField id="firstName" label="First name" autoComplete="given-name" {...bind("firstName")} />
                <TextField id="lastName" label="Last name" autoComplete="family-name" {...bind("lastName")} />
                <TextField id="email" label="Email" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" hint="Your confirmation goes here." {...bind("email")} />
                <TextField id="phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 010 1234" hint="Only used by the property on arrival day." {...bind("phone")} />
              </div>
            </Step>

            {/* 2 — extras */}
            <Step n={2} title="Extras & special requests" sub="All optional, all changeable later by messaging the property.">
              <ul className="space-y-3">
                {availableAddons.map((id) => {
                  const a = getAddon(id);
                  if (!a) return null;
                  const on = addons.includes(id);
                  const amount = addonAmount(a, nights, guests, stay.rooms);
                  return (
                    <li key={id}>
                      <label className={cn("flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-colors", on ? "border-pine-600 bg-pine-50/50 ring-1 ring-pine-600" : "border-sand-300 hover:border-ink-400")}>
                        <input type="checkbox" className="peer sr-only" checked={on} onChange={() => setAddons((l) => (on ? l.filter((x) => x !== id) : [...l, id]))} />
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine-600",
                            on ? "border-pine-600 bg-pine-600 text-white" : "border-sand-300 bg-white text-ink",
                          )}
                        >
                          {on ? <CheckIcon className="size-4" /> : <Plus className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{a.title}</span>
                          <span className="block text-sm text-ink-500">{a.desc}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums">+{money(amount)}</span>
                          <span className="block text-xs text-ink-500">
                            {money(a.price)} {a.unit}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <fieldset className="mt-6">
                <legend className="mb-1 text-sm font-semibold">Special requests</legend>
                <p className="mb-3 text-sm text-ink-500">
                  Free to add. The property sees them the moment you book and does its best — none of these are guaranteed.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {specialRequests.map((r) => {
                    const on = requests.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRequests((list) => (on ? list.filter((x) => x !== r) : [...list, r]))}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                          on ? "border-pine-600 bg-pine-600 text-white" : "border-sand-300 bg-white text-ink-700 hover:border-ink",
                        )}
                      >
                        {on ? <CheckIcon className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                        {r}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-ink-500" aria-live="polite">
                  {requests.length === 0 ? "None selected." : `${plural(requests.length, "request")} added: ${requests.join(", ")}.`}
                </p>
              </fieldset>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="arrival" className="mb-1.5 block text-sm font-semibold">
                    Arrival time <span className="font-normal text-ink-400">· optional</span>
                  </label>
                  <select id="arrival" className="field" value={arrival} onChange={(e) => setArrival(e.target.value)}>
                    <option value="">I don't know yet</option>
                    <option>Before {hotel.checkInTime} (bags can be left)</option>
                    <option>Afternoon, 3 – 6 pm</option>
                    <option>Evening, 6 – 10 pm</option>
                    <option>After 10 pm</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="requests" className="mb-1.5 block text-sm font-semibold">
                    Anything else? <span className="font-normal text-ink-400">· optional</span>
                  </label>
                  <textarea
                    id="requests"
                    rows={3}
                    maxLength={300}
                    className="field resize-y"
                    placeholder="Celebrating an anniversary, need the room near a lift, travelling with a baby…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    aria-describedby="requests-hint"
                  />
                  <p id="requests-hint" className="mt-1.5 flex justify-between text-sm text-ink-500">
                    <span>Sent with your booking. You can change it later by messaging.</span>
                    <span className="tabular-nums">{notes.length}/300</span>
                  </p>
                </div>
              </div>
            </Step>

            {/* 3 — coupon */}
            <Step n={3} id="coupon-step" title="Coupon" sub="One coupon per booking. It comes off the room price, not the extras.">
              {coupon && discount > 0 ? (
                <div role="status" className="flex items-center gap-3.5 rounded-2xl bg-pine-50 p-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pine-600 text-white" aria-hidden>
                    <CheckIcon className="size-4" />
                  </span>
                  <p className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      <span className="font-mono tracking-wide">{coupon.code}</span> applied
                    </span>
                    <span className="block text-sm text-pine-700">You're saving {money(discount)} on this stay.</span>
                  </p>
                  <button type="button" onClick={() => setApplied(null)} className="shrink-0 text-sm font-semibold underline underline-offset-4 hover:text-pine-700">
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  <label htmlFor="coupon" className="mb-1.5 block text-sm font-semibold">
                    Have a code?
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="coupon"
                      className="field font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
                      placeholder="Enter code"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={codeInput}
                      aria-invalid={couponError ? true : undefined}
                      aria-describedby={couponError ? "coupon-err" : undefined}
                      onChange={(e) => {
                        setCodeInput(e.target.value);
                        setCouponError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyCoupon(codeInput);
                        }
                      }}
                    />
                    <button type="button" onClick={() => applyCoupon(codeInput)} className={btnClass("dark", "md", "h-auto rounded-[0.875rem] px-6")}>
                      Apply
                    </button>
                  </div>
                  <p id="coupon-err" role="alert" className={cn("mt-1.5 flex items-start gap-1.5 text-sm text-danger", !couponError && "hidden")}>
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {couponError}
                  </p>
                </div>
              )}

              <h3 className="eyebrow mt-7 text-ink-500">Available for this stay</h3>
              <ul className="mt-3 space-y-3">
                {coupons.filter((c) => c.listed).map((c) => {
                  const r = evaluateCoupon(c, ctx);
                  const isApplied = applied === c.code;
                  return (
                    <li key={c.code}>
                      <CouponTicket coupon={c} notch="bg-white" muted={!r.ok} className={cn("transition-colors", isApplied ? "bg-pine-50" : "bg-sand-50")}>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                          <div className="min-w-0 flex-1 basis-56">
                            <p className="flex flex-wrap items-center gap-2 font-semibold">
                              {c.title}
                              {r.ok && best?.code === c.code && <span className="rounded-full bg-ember-600 px-2 py-0.5 text-[11px] font-bold text-white">Best value</span>}
                            </p>
                            <p className="mt-0.5 text-sm text-ink-500">{c.desc}</p>
                            {r.ok ? (
                              <p className="mt-1.5 text-sm font-semibold text-pine-700">Saves {money(r.discount)} on this stay</p>
                            ) : (
                              <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ember-700">
                                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                                {r.reason}
                              </p>
                            )}
                          </div>
                          {isApplied ? (
                            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pine-600 px-4 text-sm font-semibold text-white">
                              <CheckIcon className="size-4" aria-hidden />
                              Applied
                            </span>
                          ) : (
                            <button type="button" disabled={!r.ok} onClick={() => applyCoupon(c.code)} className={btnClass("outline", "sm")} aria-label={`Apply ${c.code}`}>
                              {applied && r.ok ? "Use instead" : "Apply"}
                            </button>
                          )}
                        </div>
                      </CouponTicket>
                    </li>
                  );
                })}
              </ul>
            </Step>

            {/* 4 — payment */}
            <Step n={4} title="Payment" sub="Encrypted in transit. Laorvia never stores your full card credentials.">
              {rate.payAtProperty && (
                <fieldset className="mb-7">
                  <legend className="mb-3 text-sm font-semibold">When would you like to pay?</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <RadioCard name="when" value="now" checked={payWhen === "now"} onChange={() => setPayWhen("now")} title="Pay now" sub={`${money(quote.total)} charged today`} />
                    <RadioCard
                      name="when"
                      value="later"
                      checked={payWhen === "later"}
                      onChange={() => setPayWhen("later")}
                      title="Pay at the property"
                      sub={`Nothing today · ${money(quote.total)} at check-in`}
                    />
                  </div>
                </fieldset>
              )}

              <fieldset>
                <legend className="mb-3 text-sm font-semibold">{payLater ? "Card to hold your room" : "How would you like to pay?"}</legend>
                {payLater && (
                  <p className="mb-4 flex items-start gap-2.5 rounded-2xl bg-sand-50 p-4 text-sm text-ink-700">
                    <Info className="mt-0.5 size-4 shrink-0 text-pine-600" aria-hidden />
                    Your card won't be charged. It's only used if you cancel after {fmtMed(cancelBy)} or don't arrive.
                  </p>
                )}
                <div className="space-y-3">
                  {!payLater && (
                    <RadioCard
                      name="method"
                      value="upi"
                      checked={method === "upi"}
                      onChange={() => setMethod("upi")}
                      title="UPI (Google Pay, PhonePe, Paytm, CRED)"
                      sub="Zero gateway surcharge · Instant confirmation"
                      aside={
                        <span className="hidden gap-1 sm:flex" aria-hidden>
                          <Mark className="font-extrabold text-pine-700">UPI</Mark>
                          <Mark>GPAY</Mark>
                          <Mark>PHONEPE</Mark>
                        </span>
                      }
                    >
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-wrap gap-2">
                          {["Google Pay", "PhonePe", "Paytm UPI", "BHIM / Any UPI"].map((app) => (
                            <button
                              key={app}
                              type="button"
                              onClick={() => setUpiId(app.toLowerCase().replace(/[^a-z]/g, "") + "@upi")}
                              className="inline-flex h-9 items-center rounded-xl border border-sand-300 bg-white px-3 text-xs font-semibold text-ink-700 hover:border-pine-600 hover:text-pine-700 transition-colors"
                            >
                              ⚡ {app}
                            </button>
                          ))}
                        </div>
                        <div>
                          <label htmlFor="upi-vpa" className="mb-1 block text-xs font-semibold text-ink-600">
                            Or enter UPI ID / VPA
                          </label>
                          <input
                            id="upi-vpa"
                            className="field text-sm"
                            placeholder="e.g. yourname@oksbi or 9876543210@paytm"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-ink-500">
                          Approved securely via NPCI. You will receive a notification on your UPI app to complete {money(quote.total)}.
                        </p>
                      </div>
                    </RadioCard>
                  )}

                  <RadioCard
                    name="method"
                    value="card"
                    checked={needCard}
                    onChange={() => setMethod("card")}
                    title={payLater ? "Credit or Debit Card (Guarantees room booking)" : "Credit / Debit Card (RuPay, Visa, Mastercard, Amex)"}
                    sub={payLater ? "Nothing charged today. Payment collected at hotel." : "Zero surcharge · Indian & international cards accepted"}
                    aside={
                      <span className="hidden gap-1 sm:flex" aria-hidden>
                        <Mark className="font-bold text-pine-700">RuPay</Mark>
                        <Mark>VISA</Mark>
                        <Mark>MC</Mark>
                      </span>
                    }
                  >
                    <div className="grid gap-4 sm:grid-cols-2 pt-1">
                      <TextField
                        id="cardNumber"
                        label="Card number"
                        className="sm:col-span-2"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="1234 5678 9012 3456"
                        trailing={brand ? <Mark className="border-pine-600 text-pine-700">{brand.toUpperCase()}</Mark> : <CreditCard className="size-5 text-ink-400" aria-hidden />}
                        {...bind("cardNumber", formatCard)}
                      />
                      <TextField id="cardName" label="Name on card" className="sm:col-span-2" autoComplete="cc-name" {...bind("cardName")} />
                      <TextField id="cardExp" label="Expiry date" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" {...bind("cardExp", formatExp)} />
                      <TextField
                        id="cardCvc"
                        label="CVV / Security code"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        placeholder={brand === "Amex" ? "4 digits" : "3 digits"}
                        hint={brand === "Amex" ? "4 digits on front of card." : "3 digits on signature strip."}
                        {...bind("cardCvc", (v) => digits(v).slice(0, cvcLength))}
                      />
                    </div>
                  </RadioCard>

                  {!payLater && (
                    <RadioCard
                      name="method"
                      value="netbanking"
                      checked={method === "netbanking"}
                      onChange={() => setMethod("netbanking")}
                      title="NetBanking (50+ Indian Banks)"
                      sub="HDFC, ICICI, SBI, Axis, Kotak, PNB & more"
                      aside={<Mark>NETBANKING</Mark>}
                    >
                      <div className="pt-1">
                        <label htmlFor="bank-select" className="mb-1.5 block text-xs font-semibold text-ink-600">Select Bank</label>
                        <select
                          id="bank-select"
                          className="field text-sm"
                          value={selectedBank}
                          onChange={(e) => setSelectedBank(e.target.value)}
                        >
                          {banks.map((b) => (
                            <option key={b}>{b}</option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs text-ink-500">You will be redirected to your bank portal for secure 2-factor OTP verification.</p>
                      </div>
                    </RadioCard>
                  )}
                </div>
              </fieldset>

              <p className="mt-5 flex items-start gap-2.5 text-sm text-ink-500">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Design prototype — no payment is taken. To try the card flow use <span className="font-mono text-ink">4242 4242 4242 4242</span>, any future date and any 3 digits.
                </span>
              </p>
            </Step>

            {/* confirm */}
            <div className="rounded-3xl bg-sand-50 p-5 sm:p-7">
              {submitError && (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-2xl bg-white p-4 text-sm font-medium text-danger">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {submitError}
                </p>
              )}
              {submitted && errorCount > 0 && (
                <p role="alert" className="mb-4 flex items-start gap-2 rounded-2xl bg-white p-4 text-sm font-medium text-danger">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {plural(errorCount, "field needs", "fields need")} a second look — we've put the cursor in the first one.
                </p>
              )}
              <p className="flex items-start gap-2.5 text-[15px]">
                {rate.refundable ? <CheckIcon className="mt-0.5 size-5 shrink-0 text-pine-600" aria-hidden /> : <Info className="mt-0.5 size-5 shrink-0 text-ink-500" aria-hidden />}
                <span>
                  {rate.refundable ? (
                    <>
                      <span className="font-semibold">Free to cancel until 6 pm on {fmtLong(cancelBy)}.</span> After that, the first night is charged.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">This rate is non-refundable.</span> It can't be changed or cancelled once you confirm.
                    </>
                  )}
                </span>
              </p>
              <div className="mt-5 hidden lg:block">{cta("w-full")}</div>
              <p className="mt-4 text-sm text-ink-500 lg:text-center">
                By confirming you agree to the property's house rules and Laorvia's fair booking terms. A confirmation goes to{" "}
                {form.email.trim() && !errors.email ? <span className="font-medium text-ink">{form.email.trim()}</span> : "your email"} within a minute.
              </p>
            </div>
          </form>

          <aside aria-label="Booking summary" className="hidden lg:block">
            <div className="sticky top-6 rounded-3xl border border-sand-200 bg-white p-6 shadow-soft">{summary}</div>
          </aside>
        </div>
      </main>

      {/* phones: persistent total + CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-ink-500">{payLater ? "Due at the property" : "Total, taxes included"}</p>
            <p className="text-xl font-bold leading-tight tabular-nums">{money(quote.total)}</p>
          </div>
          {cta("h-12 px-5 text-[15px]")}
        </div>
      </div>
    </>
  );
}

export default function BookingPage({ id, query }: { id: string | undefined; query: URLSearchParams }) {
  const hotel = getHotel(id);
  const stay = useMemo(() => parseStay(query), [query]);
  if (!hotel) return <NotFound title="We can't find that stay" />;
  const roomIndex = clamp(parseInt(query.get("room") ?? "0", 10) || 0, 0, hotel.rooms.length - 1);
  const room = hotel.rooms[roomIndex];
  const rate = room.rates.find((r) => r.id === query.get("rate")) ?? room.rates[0];
  return <Checkout key={`${hotel.id}-${roomIndex}-${rate.id}`} hotel={hotel} room={room} roomIndex={roomIndex} rate={rate} stay={stay} />;
}
