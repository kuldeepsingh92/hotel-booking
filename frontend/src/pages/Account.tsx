import { useMemo, useState } from "react";
import {
  ArrowRight, ArrowUpRight, CalendarDays, Check as CheckIcon, Heart, Luggage, MessageSquare, Moon, Receipt,
  ShieldCheck, Star, Wallet,
} from "lucide-react";
import { cn } from "../utils/cn";
import { getCity, getHotel } from "../data/hotels";
import {
  STATUS_LABEL, balanceDue, canReview, changePassword, deleteAccount, nightsUntil, paidOf, signOut, statusOf,
  unreadFrom, updateProfile, useAccount, type Booking, type TripStatus,
} from "../lib/account";
import { useCatalog } from "../lib/catalog";
import { fmtMed } from "../lib/dates";
import { money, plural } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { defaultStay } from "../lib/stay";
import { useSaved } from "../lib/store";
import { AccountNav, AccountTitle, initials } from "../components/AccountNav";
import { BookingRow, SampleNote, StatusPill } from "../components/BookingBits";
import { Footer, Header } from "../components/Header";
import { StayCard } from "../components/HotelCard";
import { Img, Modal, btnClass } from "../components/ui";

type TabId = "overview" | "trips" | "saved" | "profile";

const FILTERS: { id: TripStatus | "all"; label: string }[] = [
  { id: "all", label: "All trips" },
  { id: "upcoming", label: "Upcoming" },
  { id: "staying", label: "Staying now" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

/* Country list comes dynamically from Redis metadata (useCatalog().meta?.countries). */

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/* ───────── Overview ───────── */

function Overview({ bookings, onDismissSample, sampleVisible }: { bookings: Booking[]; onDismissSample: () => void; sampleVisible: boolean }) {
  const { threads } = useAccount();
  const saved = useSaved();
  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => statusOf(b) === "upcoming" || statusOf(b) === "staying")
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [bookings],
  );
  const next = upcoming[0] ?? null;
  const dueList = bookings.filter((b) => balanceDue(b) > 0 && statusOf(b) !== "cancelled");
  const reviewList = bookings.filter(canReview);
  const recent = bookings
    .map((b) => ({ b, t: threads.find((th) => th.ref === b.ref) }))
    .filter((x) => x.t && x.t.messages.length > 0)
    .sort((a, b) => (b.t!.messages.at(-1)?.at ?? "").localeCompare(a.t!.messages.at(-1)?.at ?? ""))
    .slice(0, 3);
  const nights = upcoming.reduce((s, b) => s + b.nights, 0);
  const spent = bookings.reduce((s, b) => s + Math.max(0, paidOf(b) - b.refundAmount), 0);
  const hotel = next ? getHotel(next.hotelId) : null;
  const city = hotel ? getCity(hotel.cityId) : null;

  return (
    <div className="space-y-5">
      {sampleVisible && bookings.some((b) => b.sample) && <SampleNote onDismiss={onDismissSample} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Luggage, label: "Upcoming stays", value: String(upcoming.length), sub: upcoming.length ? `Next in ${plural(Math.max(0, nightsUntil(upcoming[0])), "day")}` : "Nothing booked yet" },
          { icon: Moon, label: "Nights planned", value: String(nights), sub: "Across your upcoming trips" },
          { icon: Receipt, label: "Paid with Linden", value: money(spent), sub: "No booking fees, ever" },
          { icon: Heart, label: "Saved stays", value: String(saved.length), sub: saved.length ? "Waiting for a date" : "Tap a heart to save" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-sand-200 bg-white p-4">
            <s.icon className="size-4 text-pine-600" aria-hidden />
            <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums">{s.value}</p>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="mt-0.5 text-xs text-ink-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {next && hotel && city ? (
        <section aria-label="Your next stay" className="overflow-hidden rounded-[2rem] border border-sand-200 bg-white sm:grid sm:grid-cols-[19rem_1fr]">
          <div className="relative h-52 sm:h-full">
            <Img id={hotel.images[0].id} w={640} h={640} alt={hotel.name} className="size-full" />
            <span className="absolute left-4 top-4">
              <StatusPill status={statusOf(next)} className="shadow-soft" />
            </span>
          </div>
          <div className="flex flex-col justify-between gap-5 p-5 sm:p-7">
            <div>
              <p className="eyebrow text-pine-600">Your next stay · in {plural(Math.max(0, nightsUntil(next)), "day")}</p>
              <h2 className="display mt-2 text-[clamp(1.7rem,3vw,2.4rem)] leading-[1.05]">{hotel.name}</h2>
              <p className="mt-1 text-ink-500">
                {hotel.area}, {city.name}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-ink-500">Check-in</dt>
                  <dd className="mt-0.5 font-semibold">{fmtMed(next.checkIn)}</dd>
                  <dd className="text-xs text-ink-500">from {hotel.checkInTime}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Check-out</dt>
                  <dd className="mt-0.5 font-semibold">{fmtMed(next.checkOut)}</dd>
                  <dd className="text-xs text-ink-500">until {hotel.checkOutTime}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Room</dt>
                  <dd className="mt-0.5 font-semibold">{next.roomName}</dd>
                  <dd className="text-xs text-ink-500">{plural(next.nights, "night")} · {plural(next.adults + next.children, "guest")}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/account/bookings/${next.ref}`} className={btnClass("primary", "md")}>
                Manage this stay
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to={`/account/bookings/${next.ref}?to=messages`} className={btnClass("outline", "md")}>
                <MessageSquare className="size-4" aria-hidden />
                Message property
              </Link>
              {balanceDue(next) > 0 && <span className="text-sm font-semibold text-ember-700">{money(balanceDue(next))} due</span>}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-dashed border-sand-300 p-8 text-center">
          <Luggage className="mx-auto size-7 text-ink-300" aria-hidden />
          <h2 className="display mt-3 text-2xl">No trip on the calendar</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">When you book, the dates, room and host messages all land here.</p>
          <Link to="/search" className={btnClass("dark", "md", "mt-5")}>Find your next stay</Link>
        </section>
      )}

      {(dueList.length > 0 || reviewList.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {dueList.length > 0 && (
            <section className="rounded-3xl border border-ember-100 bg-ember-50/60 p-5">
              <p className="flex items-center gap-2 font-semibold">
                <Wallet className="size-4 text-ember-600" aria-hidden />
                {dueList.length === 1 ? "One balance to settle" : `${dueList.length} balances to settle`}
              </p>
              <ul className="mt-3 space-y-3">
                {dueList.map((b) => {
                  const h = getHotel(b.hotelId);
                  return (
                    <li key={b.ref} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{h?.name}</p>
                        <p className="text-xs text-ink-500">{fmtMed(b.checkIn)} · {plural(b.nights, "night")}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{money(balanceDue(b))}</span>
                      <Link to={`/account/bookings/${b.ref}?pay=1`} className={btnClass("dark", "sm")}>Pay</Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {reviewList.length > 0 && (
            <section className="rounded-3xl border border-sand-200 bg-white p-5">
              <p className="flex items-center gap-2 font-semibold">
                <Star className="size-4 text-gold" aria-hidden />
                {reviewList.length === 1 ? "A stay waiting for its review" : "Stays waiting for reviews"}
              </p>
              <ul className="mt-3 space-y-3">
                {reviewList.slice(0, 2).map((b) => {
                  const h = getHotel(b.hotelId);
                  return (
                    <li key={b.ref} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{h?.name}</p>
                        <p className="text-xs text-ink-500">Stayed {fmtMed(b.checkIn)} – {fmtMed(b.checkOut)}</p>
                      </div>
                      <Link to={`/account/bookings/${b.ref}?review=1`} className={btnClass("outline", "sm")}>Write it</Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      <section aria-label="Messages" className="rounded-3xl border border-sand-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="display text-2xl">Messages</h2>
          <Link to="/account?tab=trips" className="text-sm font-semibold text-pine-600 hover:underline">All trips</Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No messages yet. Open a trip and say hello to your host.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-200">
            {recent.map(({ b, t }) => {
              const h = getHotel(b.hotelId);
              const last = t!.messages.at(-1)!;
              const unread = unreadFrom(threads, b.ref);
              return (
                <li key={b.ref}>
                  <Link to={`/account/bookings/${b.ref}?to=messages`} className="flex items-center gap-3 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pine-50 text-xs font-bold text-pine-700">
                      {h ? getCity(h.cityId).name.charAt(0) : "L"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{h?.name}</span>
                        {unread > 0 && <span className="rounded-full bg-ember-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
                      </span>
                      <span className="block truncate text-sm text-ink-500">{last.from === "property" ? "Property: " : "You: "}{last.text}</span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-ink-400" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ───────── Trips ───────── */

function Trips({ bookings }: { bookings: Booking[] }) {
  const [filter, setFilter] = useState<TripStatus | "all">("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length };
    bookings.forEach((b) => {
      c[statusOf(b)] = (c[statusOf(b)] ?? 0) + 1;
    });
    return c;
  }, [bookings]);
  const list = useMemo(
    () =>
      bookings
        .filter((b) => filter === "all" || statusOf(b) === filter)
        .sort((a, b) => {
          const rank: Record<TripStatus, number> = { staying: 0, upcoming: 1, completed: 2, cancelled: 3 };
          const r = rank[statusOf(a)] - rank[statusOf(b)];
          return r !== 0 ? r : statusOf(a) === "completed" ? b.checkIn.localeCompare(a.checkIn) : a.checkIn.localeCompare(b.checkIn);
        }),
    [bookings, filter],
  );

  return (
    <div>
      <AccountTitle
        eyebrow="Your bookings"
        title="Every trip, receipt and request"
      >
        <Link to="/search" className={btnClass("outline", "md")}>Book another stay</Link>
      </AccountTitle>
      <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter trips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors",
              filter === f.id ? "border-ink bg-ink text-white" : "border-sand-300 bg-white text-ink-700 hover:border-ink",
            )}
          >
            {f.label}
            <span className={cn("text-xs tabular-nums", filter === f.id ? "text-white/60" : "text-ink-400")}>{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-sand-300 px-6 py-14 text-center">
          <Luggage className="mx-auto size-7 text-ink-300" aria-hidden />
          <h2 className="display mt-3 text-2xl">{filter === "all" ? "No trips yet" : `Nothing ${STATUS_LABEL[filter as TripStatus].toLowerCase()}`}</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
            {filter === "completed" ? "Once you've checked out of a stay, it moves here — and you can review it." : "Your confirmed bookings show up here straight away."}
          </p>
          <Link to="/search" className={btnClass("primary", "md", "mt-5")}>Find a stay</Link>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {list.map((b) => <BookingRow key={b.ref} booking={b} />)}
        </div>
      )}
    </div>
  );
}

/* ───────── Saved ───────── */

function Saved() {
  const { hotels: allHotels } = useCatalog();
  const saved = useSaved();
  const hotels = allHotels.filter((h) => saved.includes(h.id));
  return (
    <div>
      <AccountTitle eyebrow="Saved stays" title={`${plural(hotels.length, "stay")} on your shortlist`} />
      {hotels.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-sand-300 px-6 py-14 text-center">
          <Heart className="mx-auto size-7 text-ink-300" aria-hidden />
          <h2 className="display mt-3 text-2xl">Nothing saved yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">Tap the heart on any stay and it waits for you here, dates and all.</p>
          <Link to="/search" className={btnClass("primary", "md", "mt-5")}>Browse stays</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-x-5 gap-y-9 sm:grid-cols-2">
          {hotels.map((h) => <StayCard key={h.id} hotel={h} stay={defaultStay(h.cityId)} showCity />)}
        </div>
      )}
      <section className="mt-10 rounded-3xl bg-sand-50 p-5">
        <h2 className="font-semibold">Still deciding?</h2>
        <p className="mt-1 text-sm text-ink-500">Compare your shortlist by price and rating, starting with your dates.</p>
        <Link to="/search" className={btnClass("dark", "sm", "mt-3")}>
          Search with dates
        </Link>
      </section>
    </div>
  );
}

/* ───────── Profile ───────── */

function Profile() {
  const { user } = useAccount();
  const { meta } = useCatalog();
  const countries = meta?.countries ?? ["India"];
  const [first, setFirst] = useState(user?.firstName ?? "");
  const [last, setLast] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [marketing, setMarketing] = useState(user?.marketing ?? false);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  if (!user) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!first.trim() || !last.trim()) {
      setError("Your first and last name can't be empty — they go on the booking.");
      return;
    }
    setError("");
    const res = await updateProfile({ firstName: first.trim(), lastName: last.trim(), phone: phone.trim(), country, marketing });
    if (!res.ok) return setError(res.error ?? "Could not save changes.");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  };

  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <AccountTitle eyebrow="Profile" title="Your details" />
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <form onSubmit={save} className="rounded-3xl border border-sand-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-full bg-pine-100 text-xl font-bold text-pine-700">
              {initials(first || user.firstName, last || user.lastName)}
            </span>
            <div>
              <p className="font-semibold">{first} {last}</p>
              <p className="text-sm text-ink-500">Member since {memberSince}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="p-first" className="mb-1.5 block text-sm font-semibold">First name</label>
              <input id="p-first" className="field" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
            </div>
            <div>
              <label htmlFor="p-last" className="mb-1.5 block text-sm font-semibold">Last name</label>
              <input id="p-last" className="field" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="p-email" className="mb-1.5 block text-sm font-semibold">Email</label>
              <input id="p-email" className="field bg-sand-50 text-ink-500" value={user.email} readOnly aria-describedby="p-email-hint" />
              <p id="p-email-hint" className="mt-1.5 text-sm text-ink-500">Sign-in email. Contact support to change it in this prototype.</p>
            </div>
            <div>
              <label htmlFor="p-phone" className="mb-1.5 block text-sm font-semibold">Mobile number</label>
              <input id="p-phone" className="field" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 010 1234" autoComplete="tel" />
            </div>
            <div>
              <label htmlFor="p-country" className="mb-1.5 block text-sm font-semibold">Country of residence</label>
              <select id="p-country" className="field" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Not set</option>
                {countries.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <label className="mt-5 flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 accent-pine-600" />
            <span>Email me occasional offers. No more than twice a month, and never about a stay I've already booked.</span>
          </label>
          {error && <p role="alert" className="mt-4 rounded-xl bg-ember-50 p-3 text-sm font-medium text-ember-700">{error}</p>}
          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className={btnClass("primary", "md")}>Save changes</button>
            {saved && <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-pine-600"><CheckIcon className="size-4" aria-hidden /> Saved</span>}
          </div>
        </form>

        <div className="space-y-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await changePassword(pw.current, pw.next);
              setPwMsg(res.ok ? { ok: true, text: "Password updated in Redis. Use it next time you sign in." } : { ok: false, text: res.error ?? "Couldn't update your password." });
              if (res.ok) setPw({ current: "", next: "" });
            }}
            className="rounded-3xl border border-sand-200 bg-white p-5 sm:p-6"
          >
            <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-pine-600" aria-hidden /> Password</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="pw-current" className="mb-1.5 block text-sm font-semibold">Current password</label>
                <input id="pw-current" type="password" className="field" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" />
              </div>
              <div>
                <label htmlFor="pw-next" className="mb-1.5 block text-sm font-semibold">New password</label>
                <input id="pw-next" type="password" className="field" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" placeholder="At least 8 characters" />
              </div>
            </div>
            {pwMsg && (
              <p role="status" className={cn("mt-3 rounded-xl p-3 text-sm", pwMsg.ok ? "bg-pine-50 text-pine-700" : "bg-ember-50 text-ember-700")}>{pwMsg.text}</p>
            )}
            <button type="submit" className={btnClass("outline", "sm", "mt-4")}>Update password</button>
          </form>

          <div className="rounded-3xl border border-sand-200 bg-white p-5 sm:p-6">
            <h2 className="font-semibold">Your data</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              This is a prototype. Your account, trips and messages are stored in this browser only. You can sign out or delete the account at any time.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={async () => { await signOut(); navigate("/"); }} className={btnClass("outline", "sm")}>Sign out</button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-danger hover:bg-ember-50">
                Delete account
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this account?"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className={btnClass("outline", "md")}>Keep my account</button>
            <button
              type="button"
              onClick={async () => { await deleteAccount(); navigate("/"); }}
              className={btnClass("dark", "md", "bg-danger hover:bg-danger/90")}
            >
              Delete everything
            </button>
          </div>
        }
      >
        <p className="py-3 text-[15px] leading-relaxed text-ink-700">
          This removes your account, {plural(0, "trip").replace("0 trips", "your trips")}, saved stays and message threads from this browser. Paid bookings would normally be kept for legal reasons — in this prototype nothing is retained.
        </p>
      </Modal>
    </div>
  );
}

/* ───────── Page ───────── */

export default function Account({ query }: { query: URLSearchParams }) {
  const { user, bookings: mine } = useAccount();
  const tab = (query.get("tab") ?? "overview") as TabId;
  const [sampleDismissed, setSampleDismissed] = useState(false);
  if (!user) return null;

  return (
    <>
      <Header />
      <main className="container-x pb-10 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-pine-600">Your account</p>
            <h1 className="display mt-2 text-[clamp(2.1rem,4.4vw,3.1rem)] leading-[1.02]">
              {greeting()}, {user.firstName}.
            </h1>
            <p className="mt-1.5 text-ink-500">
              {plural(mine.filter((b) => !b.cancelledAt).length, "trip")} with us · {user.email}
            </p>
          </div>
          <div className="hidden items-center gap-2 text-sm text-ink-500 sm:flex">
            <CalendarDays className="size-4" aria-hidden />
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-7 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <AccountNav active={tab} />
          </div>
          <div className="min-w-0">
            {tab === "overview" && (
              <>
                {!sampleDismissed && <div className="mb-5">{mine.some((b) => b.sample) && <SampleNote onDismiss={() => setSampleDismissed(true)} />}</div>}
                <Overview bookings={mine} sampleVisible={false} onDismissSample={() => setSampleDismissed(true)} />
              </>
            )}
            {tab === "trips" && <Trips bookings={mine} />}
            {tab === "saved" && <Saved />}
            {tab === "profile" && <Profile />}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
