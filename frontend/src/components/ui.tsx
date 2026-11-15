import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heart, Minus, Plus, Star, X, type LucideIcon } from "lucide-react";
import {
  Baby, Bus, Car, CookingPot, Dumbbell, Flower2, Mountain, PawPrint, Snowflake, Umbrella, Utensils, Waves, Wifi, Wine,
} from "lucide-react";
import { cn } from "../utils/cn";
import { num, px } from "../lib/format";
import { ratingLabel, type AmenityKey } from "../data/hotels";
import { toggleSaved, useSaved } from "../lib/store";

/* ───────── hooks ───────── */

export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/* ───────── image with graceful fallback ───────── */

export function Img({
  id, w, h, alt, className, eager,
}: { id: number; w: number; h?: number; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  if (failed) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={cn("bg-gradient-to-br from-sand-200 via-sand-100 to-pine-100", className)}
      />
    );
  }
  return (
    <img
      src={px(id, w, h)}
      srcSet={`${px(id, w, h)} 1x, ${px(id, w * 2, h ? h * 2 : undefined)} 2x`}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("bg-sand-100 object-cover", className)}
    />
  );
}

/* ───────── buttons ───────── */

type Variant = "primary" | "dark" | "outline" | "ghost" | "light";
type Size = "sm" | "md" | "lg";

export function btnClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-9 px-4 text-sm",
    size === "md" && "h-11 px-5 text-[15px]",
    size === "lg" && "h-13 px-7 text-base",
    variant === "primary" && "bg-pine-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-pine-700",
    variant === "dark" && "bg-ink text-white hover:bg-ink-700",
    variant === "outline" && "border border-sand-300 bg-white text-ink hover:border-ink-400 hover:bg-sand-50",
    variant === "ghost" && "text-ink hover:bg-sand-100",
    variant === "light" && "bg-white text-ink hover:bg-sand-50",
    extra,
  );
}

/* ───────── ratings ───────── */

export function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-px", className)} role="img" aria-label={`${n}-star property`}>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} className="size-3 fill-gold text-gold" aria-hidden />
      ))}
    </span>
  );
}

export function ScoreChip({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-8 min-w-9 shrink-0 place-items-center rounded-[10px] rounded-bl-[3px] bg-pine-700 px-1.5 text-sm font-bold tabular-nums text-white",
        className,
      )}
    >
      {rating.toFixed(1)}
    </span>
  );
}

export function RatingBadge({ rating, reviews, className }: { rating: number; reviews?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-sm", className)}>
      <ScoreChip rating={rating} />
      <span>
        <span className="sr-only">Guest rating {rating.toFixed(1)} out of 10, </span>
        <span className="font-semibold">{ratingLabel(rating)}</span>
        {reviews !== undefined && <span className="text-ink-500"> · {num(reviews)} reviews</span>}
      </span>
    </span>
  );
}

/* ───────── save (wishlist) ───────── */

export function SaveButton({ id, name, className, labelled }: { id: string; name: string; className?: string; labelled?: boolean }) {
  const saved = useSaved().includes(id);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSaved(id);
      }}
      className={cn(
        labelled
          ? btnClass("outline", "sm")
          : "grid size-9 place-items-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur transition-transform hover:scale-110 active:scale-95",
        className,
      )}
    >
      <Heart className={cn("size-4 transition-colors", saved && "fill-ember-500 text-ember-500")} aria-hidden />
      {labelled && (saved ? "Saved" : "Save")}
    </button>
  );
}

/* ───────── amenities ───────── */

export const AMENITY_ICONS: Record<AmenityKey, LucideIcon> = {
  wifi: Wifi, pool: Waves, spa: Flower2, gym: Dumbbell, parking: Car, restaurant: Utensils, bar: Wine,
  ac: Snowflake, pets: PawPrint, beach: Umbrella, kitchen: CookingPot, shuttle: Bus, view: Mountain, family: Baby,
};

/* ───────── form bits ───────── */

export function Stepper({
  label, hint, value, min, max, onChange,
}: { label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const b =
    "grid size-9 place-items-center rounded-full border border-sand-300 bg-white text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:border-sand-200 disabled:text-ink-300";
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="font-medium">{label}</div>
        {hint && <div className="text-sm text-ink-500">{hint}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={b} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="w-5 text-center font-semibold tabular-nums" aria-live="polite" aria-label={`${value} ${label.toLowerCase()}`}>
          {value}
        </span>
        <button type="button" className={b} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  label, options, value, onChange, className,
}: {
  label: string;
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full bg-sand-100 p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
              on ? "bg-white text-ink shadow-soft" : "text-ink-500 hover:text-ink",
            )}
          >
            {o.icon && <o.icon className="size-4" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Check({
  checked, onChange, children, count, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; count?: number; disabled?: boolean }) {
  return (
    <label className={cn("group flex cursor-pointer items-center gap-3 py-1.5 text-[15px]", disabled && "cursor-not-allowed opacity-45")}>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-md border border-sand-300 bg-white transition-colors group-hover:border-ink-400 peer-checked:border-pine-600 peer-checked:bg-pine-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine-600 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
      >
        <svg viewBox="0 0 12 12" className="size-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5 5 9l4.5-5.5" />
        </svg>
      </span>
      <span className="flex-1">{children}</span>
      {count !== undefined && <span className="text-sm tabular-nums text-ink-400">{count}</span>}
    </label>
  );
}

/* ───────── modal / drawer ───────── */

export function Modal({
  open, onClose, title, children, footer, variant = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "center" | "drawer" | "full";
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  if (variant === "full") {
    return (
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[80] flex animate-fade flex-col bg-ink text-white outline-none">
        {children}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 animate-fade bg-ink/50" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute flex flex-col bg-paper shadow-pop outline-none",
          variant === "drawer"
            ? "inset-y-0 right-0 w-full max-w-md animate-fade"
            : "inset-x-4 top-1/2 mx-auto max-h-[88vh] max-w-lg -translate-y-1/2 animate-fade rounded-3xl",
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-sand-200 px-5 py-4">
          <h2 className="display text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-sand-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">{children}</div>
        {footer && <div className="border-t border-sand-200 bg-white px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
