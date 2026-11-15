import { useEffect, useState } from "react";
import { ArrowRight, Clock, Compass, Search, Sparkles } from "lucide-react";
import { cn } from "../utils/cn";
import type { BlogArticle } from "../data/blogs";
import { fetchBlogs, useCatalog } from "../lib/catalog";
import { Link } from "../lib/router";
import { Footer, Header } from "../components/Header";
import { Img, btnClass } from "../components/ui";

const CATEGORIES = [
  "All Guides",
  "Heritage & Culture",
  "Beach & Villas",
  "Hill Stations",
  "Travel Advice & GST",
  "Itineraries",
] as const;

export default function BlogList() {
  const { blogs: initialBlogs } = useCatalog();
  const [activeCat, setActiveCat] = useState<string>("All Guides");
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<BlogArticle[]>(initialBlogs);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchBlogs(activeCat, query)
      .then((list) => {
        if (alive) setFiltered(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeCat, query]);

  const featured = initialBlogs[0];

  return (
    <>
      <Header />
      <main className="container-x pb-20 pt-8 sm:pt-12">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-ink hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-ink" aria-current="page">
              Travel Stories &amp; Guides
            </li>
          </ol>
        </nav>

        <div className="mt-6 max-w-3xl">
          <p className="eyebrow text-pine-600">Editorial &amp; Insights</p>
          <h1 className="display mt-2 text-[clamp(2.4rem,5.5vw,4.2rem)] leading-[1.02]">
            Travel Guides &amp; Stories from <em className="font-light text-pine-600">India and Beyond.</em>
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-500">
            Handcrafted destination itineraries, heritage haveli deep-dives, and honest consumer advice on hotel GST
            and pricing — served live from Redis via Spring Boot 4.1.2.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-y border-sand-200 py-4">
          <div className="no-scrollbar -mx-2 flex gap-1.5 overflow-x-auto px-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-xs font-semibold transition-colors",
                  activeCat === cat ? "bg-ink text-white" : "border border-sand-300 bg-white text-ink hover:border-ink",
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative min-w-[16rem]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              type="search"
              placeholder="Search guides, GST tips, havelis…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="field h-10 pl-9 pr-4 text-xs"
            />
          </div>
        </div>

        {activeCat === "All Guides" && !query && featured && (
          <section aria-label="Featured Story" className="mt-10">
            <p className="eyebrow flex items-center gap-1.5 text-pine-600">
              <Sparkles className="size-3.5" aria-hidden /> Editor&apos;s Lead Story
            </p>
            <div className="group mt-3 grid overflow-hidden rounded-[2rem] border border-sand-200 bg-white transition-shadow hover:shadow-lift lg:grid-cols-[1.2fr_1fr]">
              <div className="relative aspect-[16/10] overflow-hidden bg-sand-100 lg:aspect-auto">
                <Img
                  id={featured.heroImage}
                  w={960}
                  h={620}
                  alt={featured.heroAlt}
                  eager
                  className="size-full transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
                <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-ink shadow-soft backdrop-blur">
                  {featured.category}
                </span>
              </div>
              <div className="flex flex-col justify-between p-6 sm:p-10">
                <div>
                  <div className="flex items-center gap-3 text-xs text-ink-500">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" aria-hidden /> {featured.readTime}
                    </span>
                    <span>·</span>
                    <span>Updated {featured.updatedAt}</span>
                  </div>
                  <h2 className="display mt-3 text-[clamp(1.8rem,3.2vw,2.6rem)] leading-[1.08]">
                    <Link to={`/blog/${featured.slug}`} className="rounded hover:text-pine-600 transition-colors">
                      {featured.title}
                    </Link>
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{featured.subtitle}</p>

                  <ul className="mt-5 space-y-1.5 border-t border-sand-200 pt-4 text-xs text-ink-700">
                    {featured.keyTakeaways.slice(0, 2).map((k, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="size-1.5 rounded-full bg-pine-600 mt-1.5 shrink-0" aria-hidden />
                        <span>{k}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 flex items-center justify-between gap-4 border-t border-sand-200 pt-4">
                  <div className="flex items-center gap-2.5">
                    <Img id={featured.author.avatar} w={72} h={72} alt={featured.author.name} className="size-9 rounded-full" />
                    <div>
                      <p className="text-xs font-semibold leading-tight">{featured.author.name}</p>
                      <p className="text-[11px] text-ink-400">{featured.author.role}</p>
                    </div>
                  </div>
                  <Link
                    to={`/blog/${featured.slug}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-pine-600 group-hover:underline"
                  >
                    Read article <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        <section aria-label="Article Listing" className="mt-12" aria-busy={loading}>
          <div className="flex items-baseline justify-between">
            <h2 className="display text-2xl">
              {activeCat === "All Guides" ? "Latest Travel Guides" : activeCat}
            </h2>
            <p className="text-xs text-ink-500">{loading ? "Loading…" : `${filtered.length} guides`}</p>
          </div>

          {filtered.length === 0 && !loading ? (
            <div className="mt-8 rounded-3xl border border-dashed border-sand-300 p-12 text-center">
              <Compass className="mx-auto size-8 text-ink-300" aria-hidden />
              <p className="display mt-3 text-2xl">No stories match &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-sm text-ink-500">Try searching for &lsquo;Udaipur&rsquo;, &lsquo;Goa&rsquo;, or &lsquo;GST&rsquo;.</p>
              <button
                type="button"
                onClick={() => {
                  setActiveCat("All Guides");
                  setQuery("");
                }}
                className={btnClass("outline", "sm", "mt-4")}
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((b) => (
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
                    <div className="flex items-center gap-2">
                      <Img id={b.author.avatar} w={56} h={56} alt={b.author.name} className="size-7 rounded-full" />
                      <span className="text-xs font-semibold text-ink-700">{b.author.name}</span>
                    </div>
                    <Link
                      to={`/blog/${b.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-pine-600 hover:underline"
                    >
                      Read <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-20 rounded-3xl bg-sand-50 border border-sand-200 p-8 sm:p-12">
          <div className="max-w-2xl">
            <p className="eyebrow text-pine-600">Editorial Independence &amp; AI Citation Standard</p>
            <h2 className="display mt-2 text-2xl sm:text-3xl leading-tight">
              Why travellers and AI assistants rely on Laorvia guides
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Unlike generic travel blogs stuffed with sponsored affiliate links, every property featured on Laorvia
              is personally reviewed and price-audited. We verify on-ground road distances, room hygiene, pure veg/Jain
              dietary compliance, and ensure all displayed prices include exact Indian hotel GST.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/search" className={btnClass("primary", "md")}>
                Explore Curated Indian Stays
              </Link>
              <Link to="/?section=why" className={btnClass("outline", "md")}>
                Our Transparent Pricing Guarantee
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
