import { getCities } from "../data/hotels";
import { addDays, addDaysISO, diffDays, isISO, toISO, today } from "./dates";
import { clamp, plural } from "./format";

/** The search a guest is making — lives in the URL so every page is shareable. */
export interface Stay {
  dest: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
}

/** Default: the first Friday at least two weeks out, for three nights. */
export function defaultStay(dest = ""): Stay {
  let d = addDays(today(), 14);
  while (d.getDay() !== 5) d = addDays(d, 1);
  return { dest, checkIn: toISO(d), checkOut: toISO(addDays(d, 3)), adults: 2, children: 0, rooms: 1 };
}

const int = (v: string | null, min: number, max: number, fallback: number) => {
  const n = v === null ? NaN : parseInt(v, 10);
  return Number.isNaN(n) ? fallback : clamp(n, min, max);
};

export function parseStay(q: URLSearchParams): Stay {
  const def = defaultStay();
  const now = toISO(today());
  let checkIn = q.get("in") ?? "";
  let checkOut = q.get("out") ?? "";
  if (!isISO(checkIn) || checkIn < now) {
    checkIn = def.checkIn;
    checkOut = def.checkOut;
  } else if (!isISO(checkOut) || checkOut <= checkIn) {
    checkOut = addDaysISO(checkIn, 1);
  }
  const dest = q.get("dest") ?? "";
  const cities = getCities();
  const adults = int(q.get("a"), 1, 8, 2);
  return {
    dest: cities.some((c) => c.id === dest) ? dest : "",
    checkIn,
    checkOut,
    adults,
    children: int(q.get("c"), 0, 6, 0),
    rooms: Math.min(int(q.get("r"), 1, 4, 1), adults),
  };
}

export function stayQuery(s: Stay, extra?: Record<string, string>) {
  const q = new URLSearchParams();
  if (s.dest) q.set("dest", s.dest);
  q.set("in", s.checkIn);
  q.set("out", s.checkOut);
  q.set("a", String(s.adults));
  q.set("c", String(s.children));
  q.set("r", String(s.rooms));
  if (extra) Object.entries(extra).forEach(([k, v]) => q.set(k, v));
  return q.toString();
}

export const nightsOf = (s: Stay) => Math.max(1, diffDays(s.checkIn, s.checkOut));
export const guestsOf = (s: Stay) => s.adults + s.children;
export const guestsLabel = (s: Stay) => `${plural(guestsOf(s), "guest")} · ${plural(s.rooms, "room")}`;
