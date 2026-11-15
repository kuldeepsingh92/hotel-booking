import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpDown, List, Map as MapIcon, Search as SearchIcon, SearchX, SlidersHorizontal, Star, X } from "lucide-react";
import { cn } from "../utils/cn";
import {
  getAmenityLabel, getCity, getFilterAmenities, getPropertyTypes, hotelsIn,
  type AmenityKey, type Hotel, type PropertyType,
} from "../data/hotels";
import { fetchHotels } from "../lib/catalog";
import { fmtRange } from "../lib/dates";
import { money, plural } from "../lib/format";
import { Link, navigate } from "../lib/router";
import { guestsLabel, nightsOf, parseStay, stayQuery, type Stay } from "../lib/stay";
import { Footer, Header } from "../components/Header";
import { ResultCard, type PriceMode } from "../components/HotelCard";
import { MapView } from "../components/MapView";
import { SearchBar } from "../components/SearchBar";
import { Check, Img, Modal, ScoreChip, Segmented, btnClass, useMedia } from "../components/ui";

interface Filters {
  price: [number, number] | null;
  freeCancel: boolean;
  breakfast: boolean;
  minRating: string;
  stars: number[];
  types: PropertyType[];
  amenities: AmenityKey[];
}

const NO_FILTERS: Filters = { price: null, freeCancel: false, breakfast: false, minRating: "0", stars: [], types: [], amenities: [] };

type SortId = "recommended" | "price-asc" | "price-desc" | "rating" | "distance";

const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function PriceFilter({
  hotels, bounds, value, onChange,
}: { hotels: Hotel[]; bounds: [number, number]; value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [min, max] = bounds;
  const [lo, hi] = value;
  const STEP = 500;
  const BUCKETS = 20;
  const span = Math.max(STEP, max - min);
  const counts = useMemo(() => {
    const c = Array(BUCKETS).fill(0) as number[];
    hotels.forEach((h) => {
      c[Math.min(BUCKETS - 1, Math.floor(((h.price - min) / span) * BUCKETS))]++;
    });
    return c;
  }, [hotels, min, span]);
  const peak = Math.max(1, ...counts);
  const pct = (v: number) => ((v - min) / span) * 100;

  return (
    <div>
      <div className="flex h-14 items-end gap-[3px] px-3" aria-hidden>
        {counts.map((c, i) => {
          const from = min + (i / BUCKETS) * span;
          const to = min + ((i + 1) / BUCKETS) * span;
          const on = to > lo && from < hi;
          return (
            <span
              key={i}
              className={cn("flex-1 rounded-t-sm transition-colors", on ? "bg-pine-500" : "bg-sand-200")}
              style={{ height: c ? `${Math.max(14, (c / peak) * 100)}%` : "2px" }}
            />
          );
        })}
      </div>
      <div className="range-dual">
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-sand-200" aria-hidden />
        <span
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-pine-600"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
          aria-hidden
        />
        <input
          type="range"
          min={min}
          max={max}
          step={STEP}
          value={lo}
          aria-label="Minimum price per night"
          aria-valuetext={money(lo)}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi - STEP), hi])}
          style={{ zIndex: lo > min + span / 2 ? 3 : 2 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={STEP}
          value={hi}
          aria-label="Maximum price per night"
          aria-valuetext={money(hi)}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + STEP)])}
          style={{ zIndex: 2 }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-sand-200 bg-white px-3 py-2">
          <span className="block text-xs text-ink-500">Min</span>
          <span className="font-semibold tabular-nums">{money(lo)}</span>
        </div>
        <div className="rounded-xl border border-sand-200 bg-white px-3 py-2">
          <span className="block text-xs text-ink-500">Max</span>
          <span className="font-semibold tabular-nums">
            {money(hi)}
            {hi === max && "+"}
          </span>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-sand-200 py-5 first:border-0 first:pt-0">
      <legend className="float-left mb-3 w-full font-semibold">{title}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

function FilterPanel({
  hotels, bounds, filters, set,
}: { hotels: Hotel[]; bounds: [number, number]; filters: Filters; set: (patch: Partial<Filters>) => void }) {
  const count = (fn: (h: Hotel) => boolean) => hotels.filter(fn).length;
  const types = getPropertyTypes().filter((t) => hotels.some((h) => h.type === t));
  const filterAmenities = getFilterAmenities();
  const starOptions = [5, 4, 3].filter((n) => hotels.some((h) => h.stars === n));

  return (
    <div>
      <FilterGroup title="Price per night">
        <PriceFilter hotels={hotels} bounds={bounds} value={filters.price ?? bounds} onChange={(price) => set({ price })} />
        <p className="mt-2.5 text-xs text-ink-500">12–18% GST and all charges included.</p>
      </FilterGroup>

      <FilterGroup title="Booking terms">
        <Check checked={filters.freeCancel} onChange={(v) => set({ freeCancel: v })} count={count((h) => h.flex)}>
          Free cancellation
        </Check>
        <Check checked={filters.breakfast} onChange={(v) => set({ breakfast: v })} count={count((h) => h.breakfast === "included")}>
          Breakfast included
        </Check>
      </FilterGroup>

      <FilterGroup title="Guest rating">
        <Segmented
          label="Minimum guest rating"
          value={filters.minRating}
          onChange={(v) => set({ minRating: v })}
          className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2"
          options={[
            { value: "0", label: "Any" },
            { value: "8.5", label: "8.5+" },
            { value: "9", label: "9+" },
            { value: "9.3", label: "9.3+" },
          ]}
        />
      </FilterGroup>

      <FilterGroup title="Star class">
        <div className="flex flex-wrap gap-2">
          {starOptions.map((n) => {
            const on = filters.stars.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => set({ stars: toggleIn(filters.stars, n) })}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors",
                  on ? "border-ink bg-ink text-white" : "border-sand-300 bg-white hover:border-ink",
                )}
              >
                {n}
                <Star className={cn("size-3.5", on ? "fill-white" : "fill-gold text-gold")} aria-hidden />
                <span className="sr-only">star</span>
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Type of stay">
        {types.map((t) => (
          <Check key={t} checked={filters.types.includes(t)} onChange={() => set({ types: toggleIn(filters.types, t) })} count={count((h) => h.type === t)}>
            {t}
          </Check>
        ))}
      </FilterGroup>

      <FilterGroup title="Amenities">
        {filterAmenities.map((a) => {
          const n = count((h) => h.amenities.includes(a));
          return (
            <Check key={a} checked={filters.amenities.includes(a)} onChange={() => set({ amenities: toggleIn(filters.amenities, a) })} count={n} disabled={n === 0}>
              {getAmenityLabel(a)}
            </Check>
          );
        })}
      </FilterGroup>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="grid overflow-hidden rounded-3xl border border-sand-200 bg-white sm:grid-cols-[16.5rem_1fr]" aria-hidden>
      <div className="skeleton min-h-52" />
      <div className="space-y-3 p-5">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-7 w-2/3 rounded-lg" />
        <div className="skeleton h-3 w-1/2 rounded-full" />
        <div className="skeleton mt-6 h-8 w-40 rounded-lg" />
        <div className="skeleton h-6 w-56 rounded-full" />
      </div>
    </div>
  );
}

export default function SearchPage({ query }: { query: URLSearchParams }) {
  const stay = useMemo(() => parseStay(query), [query]);
  const stayKey = stayQuery(stay);
  const city = stay.dest ? getCity(stay.dest) : null;
  const nights = nightsOf(stay);
  const isMd = useMedia("(min-width: 768px)");
  const isLg = useMedia("(min-width: 1024px)");

  const base = useMemo(() => hotelsIn(stay.dest), [stay.dest]);
  const bounds = useMemo<[number, number]>(() => {
    const prices = base.map((h) => h.price);
    if (!prices.length) return [0, 25000];
    return [Math.floor(Math.min(...prices) / 500) * 500, Math.ceil(Math.max(...prices) / 500) * 500];
  }, [base]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<SortId>("recommended");
  const [mode, setMode] = useState<PriceMode>("night");
  const [view, setView] = useState<"list" | "map">("list");
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  useEffect(() => {
    setFilters((f) => ({ ...f, price: null }));
    setSelectedId(null);
    setEditing(false);
    setSort((s) => (s === "distance" && !stay.dest ? "recommended" : s));
  }, [stay.dest]);

  const [lo, hi] = filters.price ?? bounds;

  // Query Spring Boot 4.1.2 + Redis whenever destination, filters, or sort changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchHotels({
      dest: stay.dest || undefined,
      minPrice: filters.price ? lo : undefined,
      maxPrice: filters.price && hi < bounds[1] ? hi : undefined,
      freeCancel: filters.freeCancel || undefined,
      breakfast: filters.breakfast || undefined,
      minRating: Number(filters.minRating) || undefined,
      stars: filters.stars.length ? filters.stars : undefined,
      types: filters.types.length ? filters.types : undefined,
      amenities: filters.amenities.length ? filters.amenities : undefined,
      sort,
    })
      .then((list) => {
        if (active) setResults(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stay.dest, filters, lo, hi, bounds, sort]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.price && (lo !== bounds[0] || hi !== bounds[1])) {
    chips.push({ key: "price", label: `${money(lo)} – ${money(hi)}${hi === bounds[1] ? "+" : ""}`, clear: () => set({ price: null }) });
  }
  if (filters.freeCancel) chips.push({ key: "fc", label: "Free cancellation", clear: () => set({ freeCancel: false }) });
  if (filters.breakfast) chips.push({ key: "bf", label: "Breakfast included", clear: () => set({ breakfast: false }) });
  if (filters.minRating !== "0") chips.push({ key: "rt", label: `Rated ${filters.minRating}+`, clear: () => set({ minRating: "0" }) });
  filters.stars.forEach((n) => chips.push({ key: `s${n}`, label: `${n}-star`, clear: () => set({ stars: filters.stars.filter((x) => x !== n) }) }));
  filters.types.forEach((t) => chips.push({ key: t, label: t, clear: () => set({ types: filters.types.filter((x) => x !== t) }) }));
  filters.amenities.forEach((a) => chips.push({ key: a, label: getAmenityLabel(a), clear: () => set({ amenities: filters.amenities.filter((x) => x !== a) }) }));

  const go = (s: Stay) => navigate(`/search?${stayQuery(s)}`);
  const priceOf = (h: Hotel) => (mode === "night" ? h.price : h.price * nights * stay.rooms);
  const pins = useMemo(
    () => results.map((h) => ({ id: h.id, lat: h.lat, lng: h.lng, label: money(mode === "night" ? h.price : h.price * nights * stay.rooms), title: h.name })),
    [results, mode, nights, stay.rooms],
  );
  const selected = results.find((h) => h.id === selectedId) ?? null;

  const selectPin = (id: string) => {
    setSelectedId(id);
    if (isLg) document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const showFilterButton = !isLg || view === "map";
  const where = city ? city.name : "all destinations";

  return (
    <>
      <Header sticky={false} />

      <div className="sticky top-0 z-30 border-b border-sand-200 bg-paper">
        <div className="container-x py-3">
          {isMd ? (
            <SearchBar key={stayKey} initial={stay} variant="compact" onSubmit={go} />
          ) : editing ? (
            <div>
              <SearchBar key={stayKey} initial={stay} variant="hero" onSubmit={go} />
              <button type="button" onClick={() => setEditing(false)} className="mt-2 w-full py-2 text-sm font-semibold text-ink-500">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex w-full items-center gap-3 rounded-full bg-white py-2 pl-4 pr-2 text-left shadow-soft ring-1 ring-sand-200"
            >
              <SearchIcon className="size-5 shrink-0 text-pine-600" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-tight">{city ? `${city.name}, ${city.state}` : "Anywhere in India"}</span>
                <span className="block truncate text-xs text-ink-500">
                  {fmtRange(stay.checkIn, stay.checkOut)} · {guestsLabel(stay)}
                </span>
              </span>
              <span className="rounded-full bg-sand-100 px-3 py-1.5 text-sm font-semibold">Edit</span>
            </button>
          )}
        </div>
      </div>

      <main className="container-x pb-10 pt-7">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <h1 className="display text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.05]" aria-live="polite">
              {loading ? `Finding stays in ${where}…` : `${plural(results.length, "stay")} in ${where}`}
            </h1>
            <p className="mt-1.5 text-ink-500">
              {fmtRange(stay.checkIn, stay.checkOut)} · {plural(nights, "night")} · {guestsLabel(stay)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Show prices"
              value={mode}
              onChange={setMode}
              options={[
                { value: "night", label: "Per night" },
                { value: "total", label: "Total stay" },
              ]}
            />
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List", icon: List },
                { value: "map", label: "Map", icon: MapIcon },
              ]}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-sand-200 py-3">
          {showFilterButton && (
            <button type="button" onClick={() => setDrawer(true)} className={btnClass("outline", "sm")}>
              <SlidersHorizontal className="size-4" aria-hidden />
              Filters
              {chips.length > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{chips.length}</span>
              )}
            </button>
          )}
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pine-50 pl-3.5 pr-2.5 text-sm font-semibold text-pine-700 transition-colors hover:bg-pine-100"
              aria-label={`Remove filter: ${c.label}`}
            >
              {c.label}
              <X className="size-3.5" aria-hidden />
            </button>
          ))}
          {chips.length > 0 && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="px-2 text-sm font-semibold text-ink-500 underline-offset-4 hover:text-ink hover:underline">
              Clear all
            </button>
          )}
          {chips.length === 0 && !showFilterButton && <span className="text-sm text-ink-500">Every price includes GST and all charges — live from Redis.</span>}
          <label className="relative ml-auto inline-flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-3.5 size-4 text-ink-500" aria-hidden />
            <span className="sr-only">Sort results</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              className="h-9 appearance-none rounded-full border border-sand-300 bg-white pl-10 pr-4 text-sm font-semibold hover:border-ink-400"
            >
              <option value="recommended">Recommended</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="rating">Guest rating</option>
              {city && <option value="distance">Closest to {city.centre}</option>}
            </select>
          </label>
        </div>

        <div className={cn("mt-6 grid gap-x-8 gap-y-6", view === "list" ? "lg:grid-cols-[17.5rem_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-6")}>
          {view === "list" && isLg && (
            <aside aria-label="Filters">
              <FilterPanel hotels={base} bounds={bounds} filters={filters} set={set} />
            </aside>
          )}

          <section aria-label="Results" aria-busy={loading} className={cn("min-w-0 space-y-4", view === "map" && "hidden lg:block")}>
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : results.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-sand-300 px-6 py-16 text-center">
                <SearchX className="mx-auto size-8 text-ink-300" aria-hidden />
                <h2 className="display mt-4 text-3xl">Nothing matches every filter</h2>
                <p className="mx-auto mt-2 max-w-sm text-ink-500">
                  {plural(base.length, "stay")} in {where} for your dates — your filters rule them all out. Price range and guest rating are the usual culprits.
                </p>
                <button type="button" onClick={() => setFilters(NO_FILTERS)} className={btnClass("dark", "md", "mt-6")}>
                  Clear all filters
                </button>
              </div>
            ) : (
              <>
                {results.map((h) => (
                  <ResultCard
                    key={h.id}
                    hotel={h}
                    stay={stay}
                    mode={mode}
                    compact={view === "map"}
                    active={view === "map" && h.id === selectedId}
                    onHover={view === "map" ? setHoverId : undefined}
                  />
                ))}
                <p className="pt-4 text-center text-sm text-ink-500">
                  That&apos;s all {plural(results.length, "stay")}.{" "}
                  {city && (
                    <Link to={`/search?${stayQuery({ ...stay, dest: "" })}`} className="font-semibold text-pine-600 hover:underline">
                      Look beyond {city.name}
                    </Link>
                  )}
                </p>
              </>
            )}
          </section>

          {view === "map" && (
            <div className="relative h-[68dvh] overflow-hidden rounded-3xl border border-sand-200 lg:sticky lg:top-24 lg:h-[calc(100dvh-7.5rem)]">
              <MapView pins={loading ? [] : pins} activeId={hoverId ?? selectedId} onSelect={selectPin} className="size-full" />
              {results.length === 0 && !loading && (
                <div className="absolute inset-x-4 top-4 z-10 rounded-2xl bg-white p-4 text-center text-sm shadow-lift">
                  No stays match your filters.{" "}
                  <button type="button" className="font-semibold text-pine-600 underline" onClick={() => setFilters(NO_FILTERS)}>
                    Clear filters
                  </button>
                </div>
              )}
              {selected && (
                <div className="absolute inset-x-3 bottom-3 z-10 animate-fade lg:hidden">
                  <div className="relative flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-pop">
                    <Img id={selected.images[0].id} w={180} h={180} alt="" className="size-20 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/hotel/${selected.id}?${stayQuery({ ...stay, dest: selected.cityId })}`} className="display block truncate text-xl leading-tight after:absolute after:inset-0">
                        {selected.name}
                      </Link>
                      <p className="truncate text-xs text-ink-500">
                        {selected.type} · {selected.area}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-sm">
                        <ScoreChip rating={selected.rating} className="h-6 min-w-7 text-xs" />
                        <span className="font-bold tabular-nums">{money(priceOf(selected))}</span>
                        <span className="text-ink-500">{mode === "night" ? "/ night" : "total"}</span>
                      </p>
                    </div>
                    <ArrowRight className="mr-1 size-5 shrink-0 text-ink-400" aria-hidden />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Modal
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filters"
        variant="drawer"
        footer={
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className={btnClass("ghost", "md")} disabled={chips.length === 0}>
              Clear all
            </button>
            <button type="button" onClick={() => setDrawer(false)} className={btnClass("primary", "md", "flex-1")}>
              Show {plural(results.length, "stay")}
            </button>
          </div>
        }
      >
        <div className="py-3">
          <FilterPanel hotels={base} bounds={bounds} filters={filters} set={set} />
        </div>
      </Modal>

      <Footer />
    </>
  );
}
