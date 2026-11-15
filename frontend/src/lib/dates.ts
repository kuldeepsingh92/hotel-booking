const pad = (n: number) => String(n).padStart(2, "0");

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const addDaysISO = (s: string, n: number) => toISO(addDays(fromISO(s), n));

export const diffDays = (a: string, b: string) =>
  Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);

export const isISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromISO(s).getTime());

const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", opts);
const SHORT = f({ month: "short", day: "numeric" });
const MED = f({ weekday: "short", month: "short", day: "numeric" });
const LONG = f({ weekday: "long", month: "long", day: "numeric", year: "numeric" });
const MONTH = f({ month: "long", year: "numeric" });

/** Jun 12 */
export const fmtShort = (s: string) => SHORT.format(fromISO(s));
/** Fri, Jun 12 */
export const fmtMed = (s: string) => MED.format(fromISO(s));
/** Friday, June 12, 2026 */
export const fmtLong = (s: string) => LONG.format(fromISO(s));
/** June 2026 */
export const fmtMonth = (d: Date) => MONTH.format(d);

/** Jun 12 – 15  or  Jun 28 – Jul 2 */
export const fmtRange = (a: string, b: string) => {
  const da = fromISO(a);
  const db = fromISO(b);
  return da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()
    ? `${SHORT.format(da)} – ${db.getDate()}`
    : `${SHORT.format(da)} – ${SHORT.format(db)}`;
};

/** True when any night of the stay falls on a Saturday. */
export const includesSaturdayNight = (checkIn: string, checkOut: string) => {
  for (let d = fromISO(checkIn), end = fromISO(checkOut); d < end; d = addDays(d, 1)) {
    if (d.getDay() === 6) return true;
  }
  return false;
};

/** Flexible rates can be cancelled free of charge until two days before arrival. */
export const freeCancelUntil = (checkIn: string) => {
  const d = addDaysISO(checkIn, -2);
  const now = toISO(today());
  return d < now ? now : d;
};
