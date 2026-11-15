import { useEffect, useState } from "react";
import {
  ArrowRight, Check, ChevronDown, Clock, Copy,
  HelpCircle, MessageCircle, Sparkles,
} from "lucide-react";
import { cn } from "../utils/cn";
import type { BlogArticle } from "../data/blogs";
import type { Hotel } from "../data/hotels";
import { fetchBlogDetail } from "../lib/catalog";
import { money } from "../lib/format";
import { Link } from "../lib/router";
import { defaultStay, stayQuery } from "../lib/stay";
import { Footer, Header } from "../components/Header";
import { Img, ScoreChip, btnClass } from "../components/ui";
import NotFound from "./NotFound";

export default function BlogDetail({ slug }: { slug: string | undefined }) {
  const [blog, setBlog] = useState<BlogArticle | null>(null);
  const [curatedHotels, setCuratedHotels] = useState<Hotel[]>([]);
  const [related, setRelated] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [copied, setCopied] = useState(false);
  const [activeSec, setActiveSec] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setNotFound(false);
    fetchBlogDetail(slug)
      .then((res) => {
        if (!alive) return;
        setBlog(res.blog);
        setCuratedHotels(res.curatedHotels ?? []);
        setRelated(res.related ?? []);
      })
      .catch(() => {
        if (alive) setNotFound(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!blog) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSec(e.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    blog.sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [blog]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="container-x pb-24 pt-12">
          <div className="skeleton h-6 w-48 rounded-full" />
          <div className="skeleton mt-4 h-14 w-3/4 rounded-2xl" />
          <div className="skeleton mt-8 aspect-[16/9] rounded-[2rem]" />
        </main>
        <Footer />
      </>
    );
  }

  if (notFound || !blog) {
    return <NotFound title="Article not found" text="This travel story may have been updated or moved. Browse our latest guides below." />;
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`${blog.title} — via Laorvia\n${window.location.href}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  return (
    <>
      <Header />
      <main className="container-x pb-24 pt-6 sm:pt-10">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/" className="hover:text-ink hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link to="/blog" className="hover:text-ink hover:underline">
                Travel Guides
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="truncate max-w-xs text-ink" aria-current="page">
              {blog.title}
            </li>
          </ol>
        </nav>

        <header className="mt-6 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-bold text-pine-700">
              {blog.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-ink-500">
              <Clock className="size-3.5" aria-hidden /> {blog.readTime}
            </span>
            <span className="text-ink-300">·</span>
            <span className="text-xs text-ink-500">Published {blog.publishedAt}</span>
            <span className="text-ink-300">·</span>
            <span className="text-xs font-semibold text-pine-700">Verified Laorvia Editorial</span>
          </div>

          <h1 className="display mt-3 text-[clamp(2.3rem,5vw,3.8rem)] leading-[1.04]">
            {blog.title}
          </h1>

          <p className="mt-4 text-lg sm:text-xl leading-relaxed text-ink-600">
            {blog.subtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-sand-200 py-3.5">
            <div className="flex items-center gap-3">
              <Img id={blog.author.avatar} w={80} h={80} alt={blog.author.name} className="size-11 rounded-full" />
              <div>
                <p className="text-sm font-semibold">{blog.author.name}</p>
                <p className="text-xs text-ink-500">{blog.author.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={shareWhatsApp}
                aria-label="Share on WhatsApp"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-sand-300 bg-white px-3.5 text-xs font-semibold hover:border-ink"
              >
                <MessageCircle className="size-3.5 text-[#25D366]" aria-hidden />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={copyUrl}
                aria-label="Copy article link"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-sand-300 bg-white px-3.5 text-xs font-semibold hover:border-ink"
              >
                {copied ? <Check className="size-3.5 text-pine-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                <span>{copied ? "Copied" : "Copy Link"}</span>
              </button>
            </div>
          </div>
        </header>

        <figure className="mt-8 overflow-hidden rounded-[2rem] border border-sand-200 bg-sand-100">
          <div className="aspect-[16/9] w-full overflow-hidden">
            <Img id={blog.heroImage} w={1200} h={675} alt={blog.heroAlt} eager className="size-full" />
          </div>
          <figcaption className="bg-white px-5 py-3 text-xs text-ink-500 border-t border-sand-100 flex items-center justify-between">
            <span>{blog.heroAlt}</span>
            <span className="italic">Laorvia Curated Travel Photography</span>
          </figcaption>
        </figure>

        <div className="mt-12 grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-sand-200 bg-white p-5">
              <p className="eyebrow text-pine-600">Table of Contents</p>
              <nav aria-label="In this article" className="mt-3 space-y-1 text-sm">
                <a
                  href="#key-takeaways"
                  className={cn(
                    "block rounded-lg px-2.5 py-1.5 transition-colors",
                    activeSec === "key-takeaways" ? "bg-sand-100 font-semibold text-ink" : "text-ink-600 hover:text-ink",
                  )}
                >
                  Key Takeaways
                </a>
                {blog.sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={cn(
                      "block rounded-lg px-2.5 py-1.5 transition-colors",
                      activeSec === s.id ? "bg-sand-100 font-semibold text-ink" : "text-ink-600 hover:text-ink",
                    )}
                  >
                    {s.heading}
                  </a>
                ))}
                {curatedHotels.length > 0 && (
                  <a
                    href="#recommended-stays"
                    className={cn(
                      "block rounded-lg px-2.5 py-1.5 transition-colors",
                      activeSec === "recommended-stays" ? "bg-sand-100 font-semibold text-ink" : "text-ink-600 hover:text-ink",
                    )}
                  >
                    Curated Stays
                  </a>
                )}
                {blog.faqs.length > 0 && (
                  <a
                    href="#faqs"
                    className={cn(
                      "block rounded-lg px-2.5 py-1.5 transition-colors",
                      activeSec === "faqs" ? "bg-sand-100 font-semibold text-ink" : "text-ink-600 hover:text-ink",
                    )}
                  >
                    Traveller FAQs
                  </a>
                )}
              </nav>

              <div className="mt-6 border-t border-sand-200 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Keywords &amp; Topics</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {blog.keywords.map((k) => (
                    <span key={k} className="rounded-md bg-sand-100 px-2 py-0.5 text-[11px] text-ink-600">
                      #{k}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <article className="min-w-0 max-w-3xl space-y-12">
            <section
              id="key-takeaways"
              className="scroll-mt-24 rounded-3xl border border-pine-200 bg-pine-50/60 p-6 sm:p-8"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-pine-700" aria-hidden />
                <h2 className="display text-xl sm:text-2xl font-bold text-pine-900">
                  Key Takeaways for Indian Travellers
                </h2>
              </div>
              <ul className="mt-4 space-y-2.5 text-sm sm:text-[15px] leading-relaxed text-pine-950">
                {blog.keyTakeaways.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-pine-600 text-xs font-bold text-white" aria-hidden>
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {blog.sections.map((sec) => (
              <section key={sec.id} id={sec.id} className="scroll-mt-24 space-y-4">
                <h2 className="display text-2xl sm:text-3xl leading-tight text-ink">
                  {sec.heading}
                </h2>
                {sec.body.map((p, pIdx) => (
                  <p key={pIdx} className="text-base sm:text-[17px] leading-relaxed text-ink-700">
                    {p}
                  </p>
                ))}

                {sec.callout && (
                  <div className="my-6 rounded-2xl border-l-4 border-pine-600 bg-sand-50 p-5">
                    <p className="font-semibold text-sm text-pine-800">{sec.callout.title}</p>
                    <p className="mt-1 text-sm text-ink-700 leading-relaxed">{sec.callout.text}</p>
                  </div>
                )}
              </section>
            ))}

            {curatedHotels.length > 0 && (
              <section id="recommended-stays" className="scroll-mt-24 border-t border-sand-200 pt-8">
                <p className="eyebrow text-pine-600">Featured Accommodations</p>
                <h2 className="display mt-1 text-2xl sm:text-3xl leading-tight">
                  Handpicked Stays Mentioned in this Guide
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  All rates include 12% GST &amp; local charges. Instant confirmation via UPI or card with zero booking fee.
                </p>

                <div className="mt-6 space-y-4">
                  {curatedHotels.map((h) => {
                    const stay = defaultStay(h.cityId);
                    return (
                      <div
                        key={h.id}
                        className="group flex flex-col sm:flex-row overflow-hidden rounded-3xl border border-sand-200 bg-white transition-shadow hover:shadow-lift"
                      >
                        <div className="relative h-48 sm:h-auto sm:w-56 shrink-0 overflow-hidden bg-sand-100">
                          <Img id={h.images[0].id} w={400} h={300} alt={h.name} className="size-full" />
                          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-ink">
                            {h.type}
                          </span>
                        </div>
                        <div className="flex flex-1 flex-col justify-between p-5">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-ink-500">{h.area}</span>
                              <ScoreChip rating={h.rating} className="h-6 min-w-7 text-xs" />
                            </div>
                            <h3 className="display mt-1 text-xl leading-snug">
                              <Link to={`/hotel/${h.id}?${stayQuery(stay)}`} className="hover:text-pine-600 transition-colors">
                                {h.name}
                              </Link>
                            </h3>
                            <p className="mt-1.5 text-xs leading-relaxed text-ink-600 line-clamp-2">
                              {h.blurb}
                            </p>
                          </div>

                          <div className="mt-4 flex items-baseline justify-between border-t border-sand-100 pt-3">
                            <div>
                              <span className="text-lg font-bold tabular-nums text-ink">{money(h.price)}</span>
                              <span className="text-xs text-ink-500"> / night (GST incl.)</span>
                            </div>
                            <Link
                              to={`/hotel/${h.id}?${stayQuery(stay)}`}
                              className={btnClass("primary", "sm")}
                            >
                              Check rooms <ArrowRight className="size-3.5" aria-hidden />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="rounded-3xl border border-sand-200 bg-sand-50 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
              <Img id={blog.author.avatar} w={120} h={120} alt={blog.author.name} className="size-16 rounded-full shrink-0 shadow-soft" />
              <div>
                <p className="eyebrow text-ink-400">Written by</p>
                <p className="display text-xl font-bold text-ink">{blog.author.name}</p>
                <p className="text-xs font-semibold text-pine-700">{blog.author.role}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{blog.author.bio}</p>
              </div>
            </div>

            {blog.faqs.length > 0 && (
              <section id="faqs" className="scroll-mt-24 border-t border-sand-200 pt-8">
                <div className="flex items-center gap-2">
                  <HelpCircle className="size-5 text-pine-600" aria-hidden />
                  <h2 className="display text-2xl sm:text-3xl">Frequently Asked Questions</h2>
                </div>
                <div className="mt-6 divide-y divide-sand-200 rounded-3xl border border-sand-200 bg-white">
                  {blog.faqs.map((faq, idx) => {
                    const isOpen = openFaq === idx;
                    return (
                      <div key={idx} className="p-5">
                        <button
                          type="button"
                          onClick={() => setOpenFaq(isOpen ? null : idx)}
                          aria-expanded={isOpen}
                          className="flex w-full items-start justify-between gap-4 text-left font-semibold text-base sm:text-lg"
                        >
                          <span>{faq.question}</span>
                          <ChevronDown
                            className={cn("size-5 text-ink-400 transition-transform shrink-0 mt-0.5", isOpen && "rotate-180")}
                            aria-hidden
                          />
                        </button>
                        {isOpen && (
                          <div className="mt-2.5 text-sm sm:text-[15px] leading-relaxed text-ink-600">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </article>
        </div>

        {related.length > 0 && (
          <section className="mt-20 border-t border-sand-200 pt-12">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="eyebrow text-pine-600">Continue Reading</p>
                <h2 className="display mt-1 text-2xl sm:text-3xl">More Stories from Laorvia Editorial</h2>
              </div>
              <Link to="/blog" className="text-sm font-semibold text-pine-600 hover:underline">
                View all guides →
              </Link>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {related.map((r) => (
                <article key={r.slug} className="group rounded-2xl border border-sand-200 bg-white overflow-hidden p-3.5">
                  <div className="aspect-[16/10] overflow-hidden rounded-xl bg-sand-100">
                    <Img id={r.heroImage} w={480} h={300} alt={r.heroAlt} className="size-full group-hover:scale-105 transition-transform" />
                  </div>
                  <div className="mt-3">
                    <span className="text-[11px] font-bold text-pine-700">{r.category}</span>
                    <h3 className="display mt-1 text-lg leading-snug">
                      <Link to={`/blog/${r.slug}`} className="hover:text-pine-600 transition-colors">
                        {r.title}
                      </Link>
                    </h3>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
