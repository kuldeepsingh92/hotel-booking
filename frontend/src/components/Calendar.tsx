import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../utils/cn";
import { addDays, fmtLong, fmtMonth, toISO, today } from "../lib/dates";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function monthCells(year: number, month: number): (string | null)[] {
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(toISO(new Date(year, month, d)));
  return cells;
}

/**
 * Check-in → check-out range picker.
 * First click sets check-in, second sets check-out; clicking on or before
 * check-in starts over. Hover previews the range before committing.
 */
export function RangeCalendar({
  start, end, onChange, months = 2,
}: {
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
  months?: 1 | 2;
}) {
  const t = today();
  const min = toISO(t);
  const max = toISO(addDays(t, 540));
  const anchor = start ? new Date(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, 1) : new Date(t.getFullYear(), t.getMonth(), 1);
  const [view, setView] = useState(anchor);
  const [hover, setHover] = useState<string | null>(null);

  const firstMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  const canPrev = view > firstMonth;
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  const pick = (iso: string) => {
    if (!start || end || iso <= start) onChange(iso, null);
    else onChange(start, iso);
  };

  const previewEnd = end ?? (start && hover && hover > start ? hover : null);

  return (
    <div className="select-none">
      <div className={cn("relative grid gap-8", months === 2 && "sm:grid-cols-2")}>
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
          className="absolute left-0 top-0 z-10 grid size-9 place-items-center rounded-full hover:bg-sand-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="absolute right-0 top-0 z-10 grid size-9 place-items-center rounded-full hover:bg-sand-100"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>

        {Array.from({ length: months }, (_, m) => {
          const d = new Date(view.getFullYear(), view.getMonth() + m, 1);
          return (
            <div key={m} className={cn(m === 1 && "hidden sm:block")}>
              <div className="grid h-9 place-items-center font-semibold" aria-live="polite">
                {fmtMonth(d)}
              </div>
              <div className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-ink-400" aria-hidden>
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1.5">{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7" onMouseLeave={() => setHover(null)}>
                {monthCells(d.getFullYear(), d.getMonth()).map((iso, i) => {
                  if (!iso) return <div key={`b${i}`} />;
                  const disabled = iso < min || iso > max;
                  const isStart = iso === start;
                  const isEnd = iso === end;
                  const isPreviewEnd = !end && iso === previewEnd;
                  const inRange = !!start && !!previewEnd && iso > start && iso < previewEnd;
                  const selected = isStart || isEnd;
                  return (
                    <div key={iso} className="relative h-10">
                      {inRange && <span className="absolute inset-0 bg-pine-50" aria-hidden />}
                      {isStart && previewEnd && <span className="absolute inset-y-0 right-0 w-1/2 bg-pine-50" aria-hidden />}
                      {(isEnd || isPreviewEnd) && <span className="absolute inset-y-0 left-0 w-1/2 bg-pine-50" aria-hidden />}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => pick(iso)}
                        onMouseEnter={() => setHover(iso)}
                        onFocus={() => setHover(iso)}
                        aria-pressed={selected}
                        aria-label={`${fmtLong(iso)}${isStart ? ", check-in" : isEnd ? ", check-out" : ""}`}
                        className={cn(
                          "relative z-[1] mx-auto grid size-10 place-items-center rounded-full text-sm tabular-nums transition-colors",
                          disabled && "cursor-not-allowed text-ink-300",
                          !disabled && !selected && "hover:bg-white hover:ring-1 hover:ring-ink",
                          selected && "bg-pine-600 font-semibold text-white",
                          isPreviewEnd && "bg-white ring-1 ring-pine-600",
                          iso === min && !selected && "font-bold text-pine-600",
                        )}
                      >
                        {Number(iso.slice(8))}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
