import { useEffect, useRef, useState } from "react";
import { ChevronDown, Heart, Lock, LogOut, Luggage, Menu, Settings, X } from "lucide-react";
import { cn } from "../utils/cn";
import { getCity, getHotel } from "../data/hotels";
import { balanceDue, signOut, useAccount } from "../lib/account";
import { useCatalog } from "../lib/catalog";
import { money } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { defaultStay, stayQuery } from "../lib/stay";
import { toggleSaved, useSaved } from "../lib/store";
import { RedisStatusBadge } from "./ApiGate";
import { Img, btnClass } from "./ui";

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 rounded-lg group" aria-label="Laorvia — Home">
      <svg viewBox="0 0 32 32" className={cn("size-8 transition-transform group-hover:scale-105", light ? "text-white" : "text-pine-600")} aria-hidden>
        <rect width="32" height="32" rx="9" fill="currentColor" fillOpacity={light ? "0.2" : "0.12"} />
        <path
          d="M7 27V15.5C7 10.8 11 7 16 7s9 3.8 9 8.5V27"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M12 27V18a4 4 0 0 1 8 0v9" fill={light ? "#ffffff" : "#235444"} />
        <circle cx="16" cy="11.5" r="2" fill={light ? "#fadcd0" : "#c4912f"} />
      </svg>
      <div className="flex flex-col">
        <span className={cn("display text-[1.65rem] leading-none tracking-tight font-medium", light ? "text-white" : "text-ink")}>
          Laorvia
        </span>
        <span className={cn("text-[9px] font-semibold tracking-widest uppercase mt-0.5", light ? "text-white/70" : "text-pine-700")}>
          India &amp; Beyond
        </span>
      </div>
    </Link>
  );
}

const NAV = [
  { label: "Destinations", to: "/?section=destinations" },
  { label: "Travel Guides", to: "/blog" },
  { label: "Offers", to: "/?section=offers" },
  { label: "Why Laorvia", to: "/?section=why" },
  { label: "All Stays", to: "/search" },
];

function useJumpToClose(close: () => void) {
  useEffect(() => {
    const onHash = () => close();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [close]);
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function scrollToSection(to: string) {
  const id = new URLSearchParams(to.split("?")[1] ?? "").get("section");
  if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SavedMenu() {
  const saved = useSaved();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  useJumpToClose(() => setOpen(false));
  const hotels = saved.map(getHotel).filter((h) => h !== null);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Saved stays${hotels.length ? `, ${hotels.length} saved` : ""}`}
        className="inline-flex h-10 items-center gap-2 rounded-full px-2.5 text-sm font-semibold hover:bg-sand-100 sm:px-3.5"
      >
        <Heart className={cn("size-4", hotels.length > 0 && "fill-ember-500 text-ember-500")} aria-hidden />
        <span className="hidden sm:inline">Saved</span>
        {hotels.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold tabular-nums text-white">
            {hotels.length}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Saved stays" className="absolute right-0 top-full z-50 mt-2 w-[21rem] max-w-[calc(100vw-2.5rem)] animate-pop rounded-3xl bg-white p-3 shadow-pop ring-1 ring-ink/5">
          {hotels.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Heart className="mx-auto size-6 text-ink-300" aria-hidden />
              <p className="mt-3 font-semibold">Nothing saved yet</p>
              <p className="mt-1 text-sm text-ink-500">Tap the heart on any stay and it will wait for you in Redis.</p>
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {hotels.map((h) => (
                <li key={h.id} className="group relative flex items-center gap-3 rounded-2xl p-2 hover:bg-sand-50">
                  <Img id={h.images[0].id} w={128} h={128} alt="" className="size-14 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/hotel/${h.id}?${stayQuery(defaultStay(h.cityId))}`}
                      onClick={() => setOpen(false)}
                      className="block truncate font-semibold after:absolute after:inset-0"
                    >
                      {h.name}
                    </Link>
                    <p className="truncate text-sm text-ink-500">
                      {getCity(h.cityId).name} · from {money(h.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleSaved(h.id)}
                    aria-label={`Remove ${h.name} from saved`}
                    className="relative z-10 grid size-8 place-items-center rounded-full text-ink-400 hover:bg-white hover:text-ink"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { user, bookings } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  useJumpToClose(() => setOpen(false));

  if (!user) {
    return (
      <div className="flex items-center gap-1">
        <Link to="/signup" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-sand-100 sm:inline-block">
          Create account
        </Link>
        <Link to="/login" className={btnClass("dark", "sm")}>
          <Lock className="size-3.5" aria-hidden />
          Sign in
        </Link>
      </div>
    );
  }

  const due = bookings.filter((b) => balanceDue(b) > 0 && !b.cancelledAt).length;
  const close = () => setOpen(false);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-2 rounded-full pl-1.5 pr-1.5 text-sm font-semibold hover:bg-sand-100 sm:pr-3"
      >
        <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-pine-100 text-[11px] font-bold text-pine-700">
          {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          {due > 0 && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-ember-500 ring-2 ring-paper" aria-hidden />}
        </span>
        <span className="hidden max-w-24 truncate sm:inline">{user.firstName}</span>
        <ChevronDown className={cn("hidden size-3.5 text-ink-400 transition-transform sm:block", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Your account" className="absolute right-0 top-full z-50 mt-2 w-[18rem] animate-pop rounded-3xl bg-white p-2 shadow-pop ring-1 ring-ink/5">
          <div className="px-3 pb-3 pt-2">
            <p className="truncate font-semibold">{user.firstName} {user.lastName}</p>
            <p className="truncate text-sm text-ink-500">{user.email}</p>
          </div>
          <div className="border-t border-sand-200 pt-1.5">
            <Link role="menuitem" to="/account" onClick={close} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-sand-50">
              <Luggage className="size-4 text-ink-500" aria-hidden />
              Overview
            </Link>
            <Link role="menuitem" to="/account?tab=trips" onClick={close} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-sand-50">
              <Luggage className="size-4 text-ink-500" aria-hidden />
              My trips
              {due > 0 && <span className="ml-auto rounded-full bg-ember-600 px-1.5 text-[11px] font-bold text-white">{due} to pay</span>}
            </Link>
            <Link role="menuitem" to="/account?tab=profile" onClick={close} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-sand-50">
              <Settings className="size-4 text-ink-500" aria-hidden />
              Profile &amp; security
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={async () => {
                close();
                await signOut();
                navigate("/");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-sand-50"
            >
              <LogOut className="size-4 text-ink-500" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ sticky = true, minimal = false }: { sticky?: boolean; minimal?: boolean }) {
  const [menu, setMenu] = useState(false);
  const { user } = useAccount();
  const signedIn = !!user;

  if (minimal) {
    return (
      <header className="border-b border-sand-200 bg-paper">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-3">
            <p className="hidden items-center gap-2 text-sm font-medium text-ink-500 sm:flex">
              <Lock className="size-4 text-pine-600" aria-hidden />
              100% Secure UPI &amp; Card Checkout
            </p>
            <AccountMenu />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        "relative z-40 border-b border-sand-200/80 bg-paper/90 backdrop-blur-md",
        sticky && "sticky top-0",
      )}
    >
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              onClick={() => scrollToSection(n.to)}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-sand-100 hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-0.5">
          <SavedMenu />
          <AccountMenu />
          <button
            type="button"
            className="ml-1 grid size-9 place-items-center rounded-full hover:bg-sand-100 md:hidden"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      {menu && (
        <nav aria-label="Mobile" className="container-x animate-fade border-t border-sand-200 pb-4 pt-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.label} to={n.to} onClick={() => { setMenu(false); scrollToSection(n.to); }} className="block border-b border-sand-100 py-3.5 text-lg font-medium">
              {n.label}
            </Link>
          ))}
          {signedIn ? (
            <>
              <Link to="/account?tab=trips" onClick={() => setMenu(false)} className="block border-b border-sand-100 py-3.5 text-lg font-medium">
                My trips
              </Link>
              <Link to="/account?tab=profile" onClick={() => setMenu(false)} className="block border-b border-sand-100 py-3.5 text-lg font-medium">
                Profile
              </Link>
              <button
                type="button"
                onClick={async () => { setMenu(false); await signOut(); navigate("/"); }}
                className="block w-full py-3.5 text-left text-lg font-medium text-ink-500"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="flex gap-2 pt-4">
              <Link to="/login" onClick={() => setMenu(false)} className={btnClass("dark", "md", "flex-1")}>Sign in</Link>
              <Link to="/signup" onClick={() => setMenu(false)} className={btnClass("outline", "md", "flex-1")}>Create account</Link>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  const { cities, blogs } = useCatalog();
  return (
    <footer className="no-print mt-24 border-t border-sand-200 bg-sand-50">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-500">
            India&apos;s transparent hospitality portal. Handpicked heritage havelis, beach villas and mountain chalets.
            All prices include 12% to 18% hotel GST with zero surprise drip-pricing and ₹0 booking fee.
          </p>
          <RedisStatusBadge />
        </div>

        <div>
          <h2 className="eyebrow text-ink-500">India Destinations</h2>
          <ul className="mt-4 space-y-2 text-[15px]">
            {cities.map((c) => (
              <li key={c.id}>
                <Link to={`/search?${stayQuery(defaultStay(c.id))}`} className="hover:text-pine-600 hover:underline">
                  {c.name} ({c.state})
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="eyebrow text-ink-500">Travel Guides &amp; GST</h2>
          <ul className="mt-4 space-y-2 text-[15px]">
            <li>
              <Link to="/blog" className="hover:text-pine-600 hover:underline">
                All Travel Guides
              </Link>
            </li>
            {blogs.slice(0, 4).map((b) => (
              <li key={b.slug}>
                <Link to={`/blog/${b.slug}`} className="block truncate hover:text-pine-600 hover:underline">
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="eyebrow text-ink-500">Guest Portal</h2>
          <ul className="mt-4 space-y-2 text-[15px]">
            <li><Link to="/account" className="hover:text-pine-600 hover:underline">My Trips &amp; Bookings</Link></li>
            <li><Link to="/account?tab=saved" className="hover:text-pine-600 hover:underline">Saved Shortlist</Link></li>
            <li><Link to="/login" className="hover:text-pine-600 hover:underline">Customer Sign In</Link></li>
            <li><Link to="/signup" className="hover:text-pine-600 hover:underline">Create Account</Link></li>
            <li><span className="text-xs text-ink-400">Accepted: UPI (GPay/PhonePe), RuPay, Cards, NetBanking</span></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-sand-200">
        <div className="container-x py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs leading-relaxed text-ink-500">
          <p>
            &copy; 2026 Laorvia (laorvia.com) · Powered by Spring Boot 4.1.2 + Redis. All rights reserved.
          </p>
          <p className="flex items-center gap-3">
            <span>GST Compliant Billing</span>
            <span>·</span>
            <span>Zero Convenience Fee</span>
            <span>·</span>
            <span>Verified Indian Guest Reviews</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
