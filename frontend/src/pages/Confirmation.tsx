import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarPlus, Check, Copy, Mail, Navigation, Printer } from "lucide-react";
import { getCity, getHotel } from "../data/hotels";
import { balanceDue, fetchBookingByRef, paidOf, useAccount, type Booking } from "../lib/account";
import { fmtLong, fmtMed } from "../lib/dates";
import { money, plural } from "../lib/format";
import { Link } from "../lib/router";
import { defaultStay, stayQuery } from "../lib/stay";
import { loadLastBookingRef } from "../lib/store";
import { Footer, Header } from "../components/Header";
import { Img, btnClass } from "../components/ui";
import NotFound from "./NotFound";

export default function Confirmation() {
  const { user, bookings } = useAccount();
  const ref = loadLastBookingRef();
  const [booking, setBooking] = useState<Booking | null>(() => (ref ? bookings.find((b) => b.ref === ref) ?? null : null));
  const [loading, setLoading] = useState(!booking && !!ref);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ref) {
      setLoading(false);
      return;
    }
    let alive = true;
    fetchBookingByRef(ref)
      .then((b) => {
        if (alive && b) setBooking(b);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ref]);

  if (loading) {
    return (
      <>
        <Header sticky={false} />
        <main className="container-x max-w-4xl py-24 text-center">
          <p className="text-ink-500">Loading your confirmed booking from Redis…</p>
        </main>
        <Footer />
      </>
    );
  }

  const hotel = booking ? getHotel(booking.hotelId) : null;
  if (!booking || !hotel) {
    return <NotFound title="No recent booking to show" text="Start a new search and we'll have you booked in a couple of minutes." />;
  }

  const city = getCity(hotel.cityId);
  const guests = booking.adults + booking.children;
  const dueNow = paidOf(booking);
  const dueLater = balanceDue(booking);

  const addToCalendar = () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Laorvia//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${booking.ref}@laorvia.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${booking.checkIn.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${booking.checkOut.replace(/-/g, "")}`,
      `SUMMARY:Stay at ${hotel.name}`,
      `LOCATION:${hotel.name}\\, ${hotel.area}\\, ${city.name}`,
      `DESCRIPTION:Confirmation ${booking.ref}. Check-in from ${hotel.checkInTime}.`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `laorvia-${booking.ref}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(booking.ref);
    } catch {
      /* ignore */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const steps = [
    {
      title: "Check your inbox",
      text: `We've emailed the full confirmation to ${booking.email}. It can take a minute to arrive.`,
    },
    booking.freeCancelUntil
      ? { title: `Change of plans? Free until ${fmtMed(booking.freeCancelUntil)}`, text: "Cancel before 6 pm that day and you pay nothing. After that, the first night is charged." }
      : { title: "This booking is final", text: "Saver rates can't be changed or refunded — that's what makes them cheaper." },
    {
      title: `Arrive from ${hotel.checkInTime} on ${fmtMed(booking.checkIn)}`,
      text: dueLater > 0 ? `Bring photo ID. You'll pay ${money(dueLater)} at reception.` : "Bring photo ID. There's nothing left to pay.",
    },
  ];

  return (
    <>
      <Header sticky={false} />
      <main className="container-x max-w-4xl pb-10 pt-12 sm:pt-16">
        <div className="animate-rise text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-pine-600 text-white">
            <svg viewBox="0 0 32 32" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 16.5 14 22.5 24.5 10.5" strokeDasharray="40" className="animate-draw" />
            </svg>
          </span>
          <p className="eyebrow mt-6 text-pine-600">Booking confirmed</p>
          <h1 className="display mx-auto mt-3 max-w-2xl text-[clamp(2.3rem,5.5vw,3.75rem)] leading-[1]">
            You&apos;re going to {city.name}, <em className="font-light text-pine-600">{booking.firstName}.</em>
          </h1>
          <p className="mx-auto mt-5 flex max-w-md items-center justify-center gap-2 text-ink-500">
            <Mail className="size-4 shrink-0" aria-hidden />
            Details sent to <span className="font-medium text-ink">{booking.email}</span>
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-sand-300 bg-white py-1.5 pl-5 pr-1.5">
            <span className="text-sm text-ink-500">Confirmation</span>
            <span className="font-mono text-lg font-semibold tracking-wider">{booking.ref}</span>
            <button type="button" onClick={copyRef} className="no-print inline-flex h-9 items-center gap-1.5 rounded-full bg-sand-100 px-3.5 text-sm font-semibold hover:bg-sand-200">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <section aria-label="Your stay" className="mt-12 animate-rise overflow-hidden rounded-[2rem] border border-sand-200 bg-white [animation-delay:120ms] sm:grid sm:grid-cols-[17rem_1fr]">
          <Img id={hotel.images[0].id} w={560} h={640} alt={hotel.name} className="h-52 w-full sm:h-full" eager />
          <div className="p-6 sm:p-8">
            <p className="eyebrow text-ink-500">{hotel.type}</p>
            <h2 className="display mt-1 text-3xl leading-tight">{hotel.name}</h2>
            <p className="mt-1 text-ink-500">
              {hotel.area}, {city.name}, {city.country}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-[15px]">
              <div>
                <dt className="text-xs text-ink-500">Check-in</dt>
                <dd className="mt-0.5 font-semibold">{fmtLong(booking.checkIn)}</dd>
                <dd className="text-sm text-ink-500">from {hotel.checkInTime}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Check-out</dt>
                <dd className="mt-0.5 font-semibold">{fmtLong(booking.checkOut)}</dd>
                <dd className="text-sm text-ink-500">until {hotel.checkOutTime}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Room</dt>
                <dd className="mt-0.5 font-semibold">
                  {booking.roomName}
                  {booking.rooms > 1 && ` × ${booking.rooms}`}
                </dd>
                <dd className="text-sm text-ink-500">
                  {booking.rateName} · {plural(booking.nights, "night")} · {plural(guests, "guest")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Payment</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {dueNow > 0 ? `${money(dueNow)} paid` : `${money(dueLater)} due at check-in`}
                </dd>
                <dd className="text-sm text-ink-500">{booking.paymentMethod}</dd>
                {booking.discount > 0 && <dd className="mt-1 text-sm font-semibold text-pine-600">You saved {money(booking.discount)}</dd>}
              </div>
            </dl>

            <div className="no-print mt-7 flex flex-wrap gap-2">
              <button type="button" onClick={addToCalendar} className={btnClass("dark", "md")}>
                <CalendarPlus className="size-4" aria-hidden />
                Add to calendar
              </button>
              <a
                href={`https://www.openstreetmap.org/?mlat=${hotel.lat}&mlon=${hotel.lng}#map=16/${hotel.lat}/${hotel.lng}`}
                target="_blank"
                rel="noreferrer"
                className={btnClass("outline", "md")}
              >
                <Navigation className="size-4" aria-hidden />
                Directions
                <ArrowUpRight className="size-3.5 text-ink-400" aria-hidden />
              </a>
              <button type="button" onClick={() => window.print()} className={btnClass("outline", "md")}>
                <Printer className="size-4" aria-hidden />
                Print
              </button>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="display text-3xl">What happens next</h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="border-t border-ink pt-4">
                <span className="display text-2xl text-pine-600">{i + 1}</span>
                <h3 className="mt-2 font-semibold leading-snug">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-500">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {(booking.requests.length > 0 || booking.notes) && (
          <section aria-label="Special requests" className="mt-10 rounded-3xl border border-sand-200 bg-white p-6">
            <h2 className="display text-2xl">Your requests are with the property</h2>
            {booking.requests.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {booking.requests.map((r) => (
                  <li key={r} className="rounded-full bg-pine-50 px-3 py-1.5 text-sm font-medium text-pine-700">{r}</li>
                ))}
              </ul>
            )}
            {booking.notes && <p className="mt-3 text-[15px] leading-relaxed text-ink-700">&ldquo;{booking.notes}&rdquo;</p>}
            <p className="mt-3 text-sm text-ink-500">
              They&apos;ll do their best, but requests can&apos;t be guaranteed. You can add to them any time from the trip page.
            </p>
          </section>
        )}

        {user ? (
          <div className="no-print mt-10 rounded-3xl bg-pine-800 p-6 text-white sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <p className="font-semibold">This trip is in your account</p>
              <p className="mt-1 text-sm text-white/70">
                Pay a balance, message the property, change a request or write a review from &ldquo;My trips&rdquo;.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <Link to={`/account/bookings/${booking.ref}`} className={btnClass("light", "md")}>Manage this trip</Link>
              <Link to="/account?tab=trips" className={btnClass("ghost", "md", "text-white hover:bg-white/10")}>All my trips</Link>
            </div>
          </div>
        ) : (
          <div className="no-print mt-10 rounded-3xl border border-dashed border-sand-300 bg-sand-50 p-6 text-center">
            <h2 className="display text-2xl">Keep this booking in one place</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
              Create an account (or sign in) and this trip moves into My trips — with online balance payment, special requests and a direct line to the property.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to={`/signup?next=${encodeURIComponent("/confirmation")}`} className={btnClass("primary", "md")}>Create an account</Link>
              <Link to={`/login?next=${encodeURIComponent("/confirmation")}`} className={btnClass("outline", "md")}>Sign in</Link>
            </div>
          </div>
        )}

        <div className="no-print mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/" className={btnClass("outline", "lg")}>
            Back to home
          </Link>
          <Link to={`/search?${stayQuery(defaultStay(hotel.cityId))}`} className={btnClass("outline", "lg")}>
            More stays in {city.name}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
