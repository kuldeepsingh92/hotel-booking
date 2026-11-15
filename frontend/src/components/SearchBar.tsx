import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Globe, MapPin, Search, Users, X } from "lucide-react";
import { cn } from "../utils/cn";
import { getCity, hotelsIn } from "../data/hotels";
import { useCatalog } from "../lib/catalog";
import { diffDays, fmtMed } from "../lib/dates";
import { money, plural } from "../lib/format";
import { guestsLabel, type Stay } from "../lib/stay";
import { RangeCalendar } from "./Calendar";
import { Img, Stepper, btnClass, useMedia } from "./ui";

type PanelId = "dest" | "dates" | "guests";
type VariantId = "hero" | "compact" | "stacked";

const STYLES: Record<VariantId, { root: string; grid: string; box: string; submit: string }> = {
  hero: {
    root: "rounded-[28px] bg-white p-2 shadow-pop ring-1 ring-ink/5",
    grid: "grid gap-1.5 md:grid-cols-[1.15fr_1.45fr_1fr_auto] md:gap-1",
    box: "rounded-[20px] bg-sand-50 px-5 py-3.5 md:bg-transparent",
    submit: "h-14 rounded-[20px] px-8 text-base md:h-full md:min-h-[4.25rem]",
  },
  compact: {
    root: "rounded-[20px] bg-white p-1.5 shadow-soft ring-1 ring-sand-200",
    grid: "grid gap-1 md:grid-cols-[1.15fr_1.45fr_1fr_auto]",
    box: "rounded-[14px] px-4 py-2",
    submit: "h-12 rounded-[14px] px-6 md:h-full",
  },
  stacked: {
    root: "",
    grid: "grid gap-2",
    box: "rounded-xl border border-sand-300 bg-white px-4 py-2.5",
    submit: "h-12 rounded-xl",
  },
};

const LABEL = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-500";
const DIVIDER =
  "md:before:absolute md:before:-left-0.5 md:before:top-1/2 md:before:h-8 md:before:w-px md:before:-translate-y-1/2 md:before:bg-sand-200";

/** Popover on desktop, bottom sheet on phones. */
function Panel({
  open, title, onClose, align = "left", width, children, footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  align?: "left" | "right";
  width: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 animate-fade bg-ink/45 md:hidden" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] animate-sheet flex-col rounded-t-[28px] bg-white shadow-pop",
          "md:absolute md:inset-x-auto md:bottom-auto md:top-full md:mt-3 md:max-h-none md:animate-pop md:rounded-3xl md:ring-1 md:ring-ink/5",
          align === "right" ? "md:right-0" : "md:left-0",
          width,
        )}
      >
        <div className="flex items-center justify-between px-5 pt-4 md:hidden">
          <h2 className="display text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-sand-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-sand-200 px-5 py-3.5">{footer}</div>}
      </div>
    </>
  );
}

export function SearchBar({
  initial, variant = "hero", hideDest, autoSubmit, submitLabel = "Search", onSubmit,
}: {
  initial: Stay;
  variant?: VariantId;
  hideDest?: boolean;
  /** Apply changes as soon as a picker closes (no submit button). */
  autoSubmit?: boolean;
  submitLabel?: string;
  onSubmit: (s: Stay) => void;
}) {
  const uid = useId();
  const [stay, setStay] = useState(initial);
  const [open, setOpen] = useState<PanelId | null>(null);
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({
    start: initial.checkIn,
    end: initial.checkOut,
  });
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const root = useRef<HTMLDivElement>(null);
  const stayRef = useRef(stay);
  const dirty = useRef(false);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const isMd = useMedia("(min-width: 768px)");
  const isLg = useMedia("(min-width: 1024px)");
  const s = STYLES[variant];
  const stacked = variant === "stacked";

  const update = (patch: Partial<Stay>) => {
    const next = { ...stayRef.current, ...patch };
    if (next.rooms > next.adults) next.rooms = next.adults;
    stayRef.current = next;
    dirty.current = true;
    setStay(next);
  };

  const flush = useCallback(() => {
    if (autoSubmit && dirty.current) {
      dirty.current = false;
      submitRef.current(stayRef.current);
    }
  }, [autoSubmit]);

  const close = useCallback(() => {
    setOpen(null);
    setRange((r) => (r.start && r.end ? r : { start: stayRef.current.checkIn, end: stayRef.current.checkOut }));
    flush();
  }, [flush]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Lock page scroll behind the mobile sheet.
  useEffect(() => {
    if (!open || isMd) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMd]);

  /* Destination */
  const { cities: allCities, hotels: allHotels } = useCatalog();
  const city = stay.dest ? getCity(stay.dest) : null;
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = allCities.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    );
    return [...(q ? [] : [null]), ...matched];
  }, [allCities, query]);

  const choose = (id: string) => {
    update({ dest: id });
    setQuery("");
    setOpen("dates");
  };

  const openDest = () => {
    if (open !== "dest") {
      setOpen("dest");
      setQuery("");
      setCursor(0);
    }
  };

  /* Dates */
  const onRange = (start: string | null, end: string | null) => {
    setRange({ start, end });
    if (start && end) {
      update({ checkIn: start, checkOut: end });
      if (isMd) {
        window.setTimeout(() => {
          setOpen((o) => (o === "dates" ? null : o));
          flush();
        }, 260);
      }
    }
  };
  const draftNights = range.start && range.end ? diffDays(range.start, range.end) : 0;

  const toggle = (id: PanelId) => (open === id ? close() : setOpen(id));
  const boxClass = (id: PanelId) =>
    cn(
      "flex w-full flex-col gap-0.5 text-left outline-none transition-colors",
      s.box,
      !stacked && "hover:bg-sand-50 focus-visible:bg-sand-50",
      stacked && "hover:border-ink-400",
      open === id && (stacked ? "border-pine-600 ring-[3px] ring-pine-600/15" : "bg-sand-50 ring-1 ring-ink/10 md:bg-sand-50"),
    );

  const doneButton = (label: string) => (
    <button type="button" onClick={close} className={btnClass("dark", "md", "w-full md:w-auto")}>
      {label}
    </button>
  );

  return (
    <div ref={root} role="search" aria-label="Find a stay" className={cn("relative", open ? "z-50" : "z-30", s.root)}>
      <div className={s.grid}>
        {!hideDest && (
          <div className="relative">
            <label className={cn(boxClass("dest"), "cursor-text")}>
              <span className={LABEL}>
                <MapPin className="size-3.5" aria-hidden /> Where
              </span>
              <input
                role="combobox"
                aria-expanded={open === "dest"}
                aria-controls={`${uid}-dest`}
                aria-autocomplete="list"
                aria-activedescendant={open === "dest" && options.length ? `${uid}-opt-${cursor}` : undefined}
                autoComplete="off"
                readOnly={!isMd}
                value={open === "dest" && isMd ? query : city ? `${city.name}, ${city.country}` : ""}
                placeholder={open === "dest" && isMd ? "Try “Udaipur”, “Goa” or “Manali”" : "Anywhere"}
                onFocus={openDest}
                onClick={openDest}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    openDest();
                    setCursor((c) => Math.min(c + 1, options.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === "Enter" && open === "dest" && options.length) {
                    e.preventDefault();
                    choose(options[cursor]?.id ?? "");
                  } else if (e.key === "Tab") {
                    close();
                  }
                }}
                className={cn(
                  "w-full truncate bg-transparent font-medium outline-none",
                  variant === "compact" ? "text-sm" : "text-[15px]",
                  !(open === "dest" && isMd) && "placeholder:text-ink",
                  !isMd && "cursor-pointer",
                )}
              />
            </label>
            <Panel open={open === "dest"} title="Where to?" onClose={close} width="md:w-[23rem]">
              <ul id={`${uid}-dest`} role="listbox" aria-label="Destinations" className="-m-2">
                {options.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-ink-500">
                    No destinations match “{query}”. We're in {allCities.length} cities so far —
                    <button type="button" className="ml-1 font-semibold text-pine-600 underline" onClick={() => setQuery("")}>
                      see them all
                    </button>
                    .
                  </li>
                )}
                {options.map((c, i) => {
                  const active = i === cursor;
                  const from = c ? Math.min(...hotelsIn(c.id).map((h) => h.price)) : 0;
                  return (
                    <li
                      key={c?.id ?? "any"}
                      id={`${uid}-opt-${i}`}
                      role="option"
                      aria-selected={(c?.id ?? "") === stay.dest}
                      onMouseEnter={() => setCursor(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(c?.id ?? "")}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-2xl p-2", active && "bg-sand-50")}
                    >
                      {c ? (
                        <Img id={c.image} w={96} h={96} alt="" className="size-12 rounded-xl" />
                      ) : (
                        <span className="grid size-12 place-items-center rounded-xl bg-pine-50 text-pine-600">
                          <Globe className="size-5" aria-hidden />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{c ? c.name : "Anywhere"}</span>
                        <span className="block truncate text-sm text-ink-500">
                          {c ? `${c.state}, ${c.country}` : `Browse all ${allHotels.length} stays`}
                        </span>
                      </span>
                      {c && <span className="text-sm text-ink-500">from {money(from)}</span>}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        )}

        <div className={cn("relative", !stacked && !hideDest && DIVIDER)}>
          <button type="button" className={boxClass("dates")} onClick={() => toggle("dates")} aria-expanded={open === "dates"} aria-haspopup="dialog">
            <span className={LABEL}>
              <CalendarDays className="size-3.5" aria-hidden /> Dates
            </span>
            <span className={cn("flex items-baseline gap-2 font-medium", variant === "compact" ? "text-sm" : "text-[15px]")}>
              <span className="truncate">
                {fmtMed(stay.checkIn)} <span className="text-ink-400">→</span> {fmtMed(stay.checkOut)}
              </span>
              <span className="shrink-0 text-xs font-medium text-ink-500">{plural(diffDays(stay.checkIn, stay.checkOut), "night")}</span>
            </span>
          </button>
          <Panel
            open={open === "dates"}
            title="When?"
            onClose={close}
            align={stacked ? "right" : "left"}
            width={isLg && !stacked ? "md:w-[41rem]" : "md:w-[21.5rem]"}
            footer={
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-ink-500" aria-live="polite">
                  {range.start && range.end ? (
                    <>
                      <span className="font-semibold text-ink">{plural(draftNights, "night")}</span> · {fmtMed(range.start)} – {fmtMed(range.end)}
                    </>
                  ) : range.start ? (
                    "Now pick your check-out date"
                  ) : (
                    "Pick your check-in date"
                  )}
                </p>
                <div className="md:hidden">{doneButton("Done")}</div>
              </div>
            }
          >
            <RangeCalendar start={range.start} end={range.end} onChange={onRange} months={isLg && !stacked ? 2 : 1} />
          </Panel>
        </div>

        <div className={cn("relative", !stacked && DIVIDER)}>
          <button type="button" className={boxClass("guests")} onClick={() => toggle("guests")} aria-expanded={open === "guests"} aria-haspopup="dialog">
            <span className={LABEL}>
              <Users className="size-3.5" aria-hidden /> Guests
            </span>
            <span className={cn("truncate font-medium", variant === "compact" ? "text-sm" : "text-[15px]")}>{guestsLabel(stay)}</span>
          </button>
          <Panel open={open === "guests"} title="Who's coming?" onClose={close} align="right" width="md:w-[21rem]" footer={<div className="flex justify-end">{doneButton("Done")}</div>}>
            <div className="divide-y divide-sand-200">
              <Stepper label="Adults" hint="Ages 13+" value={stay.adults} min={1} max={8} onChange={(n) => update({ adults: n })} />
              <Stepper label="Children" hint="Ages 0 – 12" value={stay.children} min={0} max={6} onChange={(n) => update({ children: n })} />
              <Stepper label="Rooms" hint="At least one adult per room" value={stay.rooms} min={1} max={Math.min(4, stay.adults)} onChange={(n) => update({ rooms: n })} />
            </div>
          </Panel>
        </div>

        {!autoSubmit && (
          <button
            type="button"
            onClick={() => {
              setOpen(null);
              dirty.current = false;
              onSubmit(stayRef.current);
            }}
            className={btnClass("primary", "lg", s.submit)}
          >
            <Search className="size-5" aria-hidden />
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
