import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight, BadgeCheck, Check, Clock, Copy,
  Receipt, ShieldCheck, Star, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "../utils/cn";
import { getCity, getHotel, hotelsIn } from "../data/hotels";
import { useCatalog } from "../lib/catalog";
import { money } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { defaultStay, nightsOf, stayQuery } from "../lib/stay";
import { Footer, Header } from "../components/Header";
import { CouponTicket, StayCard } from "../components/HotelCard";
import { SearchBar } from "../components/SearchBar";
import { Img, ScoreChip, btnClass } from "../components/ui";

const PROMISE_ICONS: Record<string, LucideIcon> = {
  receipt: Receipt,
  zap: Zap,
  shield: ShieldCheck,
  badge: BadgeCheck,
};

function SectionHead({ eyebrow, title, aside }: { eyebrow: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div>
        <p className="eyebrow text-pine-600">{eyebrow}</p>
        <h2 className="display mt-2 text-[clamp(2rem,4vw,3rem)] leading-[1.05]">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export default function Home({ query }: { query: URLSearchParams }) {
  const { cities, hotels, blogs, coupons, home, meta } = useCatalog();
  const defaultDest = cities[0]?.id ?? "";
  const stay = useMemo(() => defaultStay(defaultDest), [defaultDest]);
  const nights = nightsOf(stay);
  const [tab, setTab] = useState("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const section = query.get("section");
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section]);

  const featured = useMemo(
    () =>
      hotels
        .filter((h) => tab === "all" || h.tags.includes(tab))
        .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
        .slice(0, 8),
    [hotels, tab],
  );

  const hero = getHotel(meta?.heroHotelId) ?? hotels[0];
  const sample = getHotel(meta?.sampleReceiptHotelId) ?? hotels[1] ?? hotels[0];
  const trendingIds = meta?.trendingCityIds?.length ? meta.trendingCityIds : cities.map((c) => c.id);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* clipboard blocked */
    }
    setCopied(code);
    window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 2200);
  };

  return (
    <>
      <Header />
      <main>
        {/* ───────── Hero ───────── */}
        <section className="relative">
          <div className="container-x grid items-end gap-10 pb-10 pt-10 sm:pt-14 lg:grid-cols-12 lg:pb-12 lg:pt-16">
            <div className="lg:col-span-7 lg:pb-4">
              <p className="inline-flex animate-rise items-center gap-2.5 rounded-full border border-sand-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-700 shadow-soft">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                <span>India&apos;s Most Transparent Booking Portal · All-Inclusive GST Upfront</span>
              </p>
              <h1 className="display mt-6 animate-rise text-[clamp(2.9rem,7.2vw,5.5rem)] leading-[0.95] [animation-delay:70ms]">
                Discover stays <em className="font-light text-pine-600">crafted for India&apos;s</em> discerning travellers.
              </h1>
              <p className="mt-6 max-w-xl animate-rise text-lg leading-relaxed text-ink-500 [animation-delay:140ms]">
                Handpicked heritage palaces, lakefront havelis, Goan Portuguese villas, and Himalayan pine chalets.
                The price you see is the final price — zero hidden GST surprise, zero platform fees.
              </p>
            </div>

            {hero && (
              <div className="relative hidden h-[27rem] animate-fade [animation-delay:200ms] lg:col-span-5 lg:block">
                <span className="absolute left-[30%] top-1 size-24 rounded-full bg-amber-100" aria-hidden />
                <div className="absolute bottom-0 right-0 h-[25.5rem] w-[17.5rem] overflow-hidden rounded-b-[2rem] rounded-t-full bg-sand-100 shadow-lift">
                  <Img id={hero.images[0].id} w={560} h={820} alt={hero.name} eager className="size-full" />
                </div>
                <div className="absolute bottom-0 left-0 h-[14.5rem] w-[10.5rem] overflow-hidden rounded-b-[1.5rem] rounded-t-full border-[6px] border-paper bg-sand-100 shadow-soft">
                  <Img id={hero.images[2]?.id ?? hero.images[0].id} w={340} h={480} alt="" eager className="size-full" />
                </div>
                <Link
                  to={`/hotel/${hero.id}?${stayQuery({ ...stay, dest: hero.cityId })}`}
                  className="group absolute left-0 top-[4.75rem] flex w-[16.5rem] items-center gap-3 rounded-2xl bg-white p-3 shadow-lift ring-1 ring-ink/5 transition-transform hover:-translate-y-0.5"
                >
                  <ScoreChip rating={hero.rating} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{hero.name}</span>
                    <span className="block truncate text-xs text-ink-500">
                      {hero.area}, {getCity(hero.cityId).name} · from {money(hero.price)}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            )}
          </div>

          <div className="container-x">
            <SearchBar initial={stay} onSubmit={(s) => navigate(`/search?${stayQuery(s)}`)} />
            <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
              <span className="mr-1 text-ink-500">Trending getaways for {nights === 3 ? "a long weekend" : `${nights} nights`}:</span>
              {trendingIds.map((id) => (
                <Link
                  key={id}
                  to={`/search?${stayQuery({ ...stay, dest: id })}`}
                  className="rounded-full border border-sand-200 bg-white px-3.5 py-1.5 font-medium transition-colors hover:border-ink"
                >
                  {getCity(id).name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Destinations ───────── */}
        <section id="destinations" className="container-x mt-20 scroll-mt-24 sm:mt-28">
          <SectionHead
            eyebrow="Curated India"
            title="Where is your heart taking you?"
            aside={
              <Link to={`/search?${stayQuery({ ...stay, dest: "" })}`} className="group inline-flex items-center gap-1.5 font-semibold text-pine-600 hover:underline">
                Explore all {hotels.length} verified stays
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            }
          />
          <ul className="mt-9 grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-5">
            {cities.map((c) => {
              const list = hotelsIn(c.id);
              const from = list.length ? Math.min(...list.map((h) => h.price)) : 0;
              return (
                <li key={c.id}>
                  <Link to={`/search?${stayQuery({ ...stay, dest: c.id })}`} className="group block rounded-3xl">
                    <div className="aspect-[3/4.4] overflow-hidden rounded-b-3xl rounded-t-full bg-sand-100">
                      <Img
                        id={c.image}
                        w={400}
                        h={590}
                        alt={c.name}
                        className="size-full transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                    <h3 className="display mt-3.5 text-2xl leading-tight">{c.name}</h3>
                    <p className="mt-0.5 text-xs text-ink-400 font-medium uppercase tracking-wider">{c.state}</p>
                    <p className="mt-0.5 text-sm text-ink-500 line-clamp-1">{c.line}</p>
                    {from > 0 && (
                      <p className="mt-1.5 text-sm">
                        <span className="font-semibold text-ink">from {money(from)}</span>
                        <span className="text-ink-400 text-xs"> (GST incl.)</span>
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ───────── Customer Testimonials (from Redis) ───────── */}
        {home.testimonials.length > 0 && (
          <section className="container-x mt-20 sm:mt-28">
            <SectionHead
              eyebrow="Real Experiences"
              title="What Indian travellers say about Laorvia"
              aside={
                <p className="max-w-xs text-sm text-ink-500">
                  100% verified guest reviews from checked-out stays across India.
                </p>
              }
            />
            <div className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {home.testimonials.map((t) => (
                <div
                  key={t.name}
                  className="flex flex-col justify-between rounded-3xl border border-sand-200 bg-white p-6 shadow-soft transition-shadow hover:shadow-lift"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-pine-50 px-2.5 py-0.5 text-[11px] font-bold text-pine-700">
                        {t.tag}
                      </span>
                      <div className="flex items-center gap-0.5" aria-label={`${t.rating} stars`}>
                        {Array.from({ length: t.rating }).map((_, i) => (
                          <Star key={i} className="size-3.5 fill-gold text-gold" aria-hidden />
                        ))}
                      </div>
                    </div>

                    <p className="display mt-4 text-[1.15rem] leading-snug text-ink">
                      &ldquo;{t.quote}&rdquo;
                    </p>

                    <p className="mt-3 text-xs font-semibold text-pine-700">
                      Stayed at {t.hotelName}
                    </p>
                  </div>

                  <div className="mt-6 flex items-center gap-3 border-t border-sand-200 pt-4">
                    <Img id={t.avatar} w={64} h={64} alt={t.name} className="size-10 rounded-full" />
                    <div>
                      <p className="text-sm font-semibold leading-tight">{t.name}</p>
                      <p className="text-xs text-ink-400">{t.location}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ───────── Offers / Festive Coupons (from Redis) ───────── */}
        <section id="offers" className="mt-20 scroll-mt-16 border-y border-sand-200 bg-sand-50 py-16 sm:mt-28 sm:py-20">
          <div className="container-x">
            <SectionHead
              eyebrow="Special Offers"
              title="Exclusive promo codes for your stay"
              aside={<p className="max-w-xs text-sm text-ink-500">Apply during booking for instant savings. Stackable with all-inclusive GST rates.</p>}
            />
            <ul className="mt-9 grid gap-5 lg:grid-cols-3">
              {coupons
                .filter((c) => c.listed)
                .map((c) => (
                  <li key={c.code}>
                    <CouponTicket coupon={c} notch="bg-sand-50" className="h-full bg-white shadow-soft">
                      <h3 className="font-semibold">{c.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-500">{c.desc}</p>
                      <div className="mt-3.5 flex items-center gap-2">
                        <code className="rounded-lg border border-dashed border-sand-300 bg-sand-50 px-2.5 py-1.5 font-mono text-sm font-semibold tracking-wide">
                          {c.code}
                        </code>
                        <button
                          type="button"
                          onClick={() => copy(c.code)}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
                            copied === c.code ? "bg-pine-50 text-pine-700" : "text-pine-600 hover:bg-pine-50",
                          )}
                          aria-label={`Copy code ${c.code}`}
                        >
                          {copied === c.code ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                          <span aria-live="polite">{copied === c.code ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    </CouponTicket>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        {/* ───────── Guest Favourites ───────── */}
        <section className="container-x mt-20 sm:mt-28">
          <SectionHead eyebrow="Curated Gems" title="Properties travellers return to again &amp; again" />
          <div className="no-scrollbar -mx-5 mt-7 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter favourites">
            {home.tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors",
                  tab === t.id ? "border-ink bg-ink text-white" : "border-sand-300 bg-white text-ink-700 hover:border-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div key={tab} className="mt-8 grid animate-fade gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((h) => (
              <StayCard key={h.id} hotel={h} stay={stay} />
            ))}
          </div>
        </section>

        {/* ───────── Blog Stories on Homepage (from Redis) ───────── */}
        {blogs.length > 0 && (
          <section className="container-x mt-20 sm:mt-28">
            <SectionHead
              eyebrow="Travel Journal"
              title="Stories, Itineraries &amp; Insider Guides"
              aside={
                <Link to="/blog" className="group inline-flex items-center gap-1.5 font-semibold text-pine-600 hover:underline">
                  View all travel stories
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              }
            />
            <div className="mt-9 grid gap-6 sm:grid-cols-3">
              {blogs.slice(0, 3).map((b) => (
                <article
                  key={b.slug}
                  className="group flex flex-col justify-between overflow-hidden rounded-3xl border border-sand-200 bg-white transition-all hover:shadow-lift"
                >
                  <div>
                    <div className="relative aspect-[16/10] overflow-hidden bg-sand-100">
                      <Img
                        id={b.heroImage}
                        w={600}
                        h={380}
                        alt={b.heroAlt}
                        className="size-full transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-bold text-ink shadow-soft backdrop-blur">
                        {b.category}
                      </span>
                    </div>

                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs text-ink-400">
                        <Clock className="size-3" aria-hidden />
                        <span>{b.readTime}</span>
                        <span>·</span>
                        <span>{b.publishedAt}</span>
                      </div>

                      <h3 className="display mt-2 text-[1.35rem] leading-snug">
                        <Link to={`/blog/${b.slug}`} className="hover:text-pine-600 transition-colors">
                          {b.title}
                        </Link>
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-500 line-clamp-3">
                        {b.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-sand-200 p-5 pt-3.5">
                    <span className="text-xs font-semibold text-ink-700">{b.author.name}</span>
                    <Link
                      to={`/blog/${b.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-pine-600 hover:underline"
                    >
                      Read Guide <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ───────── Why Laorvia ───────── */}
        <section id="why" className="mt-20 scroll-mt-16 bg-pine-900 py-20 text-white sm:mt-28 sm:py-24">
          <div className="container-x grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <div>
              <p className="eyebrow text-pine-200">The Laorvia Standard</p>
              <h2 className="display mt-3 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[1.02]">
                Booking a room in India, <em className="font-light text-pine-200">without the tricks.</em>
              </h2>
              <ul className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
                {home.promises.map((p) => {
                  const Icon = PROMISE_ICONS[p.icon] ?? Receipt;
                  return (
                    <li key={p.title}>
                      <Icon className="size-6 text-pine-200" strokeWidth={1.6} aria-hidden />
                      <h3 className="mt-3.5 text-lg font-semibold">{p.title}</h3>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-white/70">{p.text}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            {sample && (
              <figure className="mx-auto w-full max-w-sm lg:-rotate-2">
                <div className="rounded-3xl bg-paper p-6 text-ink shadow-pop">
                  <div className="flex items-center gap-3">
                    <Img id={sample.images[0].id} w={120} h={120} alt="" className="size-14 rounded-2xl" />
                    <div className="min-w-0">
                      <p className="display truncate text-xl leading-tight">{sample.name}</p>
                      <p className="text-sm text-ink-500">
                        {sample.area}, {getCity(sample.cityId).name}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-5 space-y-2.5 border-t border-dashed border-sand-300 pt-5 text-[15px] tabular-nums">
                    <div className="flex justify-between">
                      <dt>3 nights × {money(sample.price)}</dt>
                      <dd className="font-semibold">{money(sample.price * 3)}</dd>
                    </div>
                    <div className="flex justify-between text-ink-500">
                      <dt>12% Hotel GST</dt>
                      <dd>Included</dd>
                    </div>
                    <div className="flex justify-between text-ink-500">
                      <dt>Platform convenience fee</dt>
                      <dd>₹0 (Free)</dd>
                    </div>
                    <div className="flex justify-between text-ink-500">
                      <dt>UPI / Card payment surcharge</dt>
                      <dd>₹0 (Free)</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex items-baseline justify-between border-t border-ink pt-4">
                    <span className="font-semibold">You pay</span>
                    <span className="text-3xl font-bold tracking-tight tabular-nums">{money(sample.price * 3)}</span>
                  </div>
                </div>
                <figcaption className="mt-5 text-center text-sm text-white/60">
                  Identical amount on search, room selection, and at UPI payment.
                </figcaption>
              </figure>
            )}
          </div>
        </section>

        {/* ───────── FAQ Section (from Redis) ───────── */}
        {home.faqs.length > 0 && (
          <section className="container-x mt-20 sm:mt-28">
            <SectionHead
              eyebrow="Got Questions?"
              title="Frequently Asked Questions by Indian Travellers"
            />
            <div className="mt-8 divide-y divide-sand-200 rounded-3xl border border-sand-200 bg-white">
              {home.faqs.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className="p-6">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      className="flex w-full items-start justify-between gap-4 text-left font-semibold text-lg"
                    >
                      <span>{faq.q}</span>
                      <span className="text-pine-600 font-bold text-xl">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-sm sm:text-base leading-relaxed text-ink-600">
                        {faq.a}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ───────── Closing CTA ───────── */}
        <section className="container-x mt-20 text-center sm:mt-28">
          <h2 className="display mx-auto max-w-2xl text-[clamp(2rem,4.4vw,3.25rem)] leading-[1.05]">
            Ready for your next trip? <em className="font-light text-pine-600">Explore authentic India.</em>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-ink-500">
            Handpicked palace stays, beachfront villas, and Himalayan chalets with full GST transparency.
          </p>
          <Link to={`/search?${stayQuery({ ...stay, dest: "" })}`} className={btnClass("primary", "lg", "mt-8")}>
            Browse all stays <ArrowRight className="size-5" aria-hidden />
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
