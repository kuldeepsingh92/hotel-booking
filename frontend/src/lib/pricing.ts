import { getCatalog } from "./catalog";
import { includesSaturdayNight } from "./dates";
import { money, plural } from "./format";

/* ───────────── Coupons (loaded from Redis via Spring Boot API) ───────────── */

export interface Coupon {
  code: string;
  headline: string;
  title: string;
  desc: string;
  kind: "percent" | "fixed";
  value: number;
  cap?: number;
  minNights?: number;
  minSpend?: number;
  saturday?: boolean;
  expired?: string;
  listed: boolean;
}

export interface CouponEvaluateResponse {
  ok: boolean;
  discount: number;
  reason?: string | null;
  coupon?: Coupon | null;
}

export const getCoupons = (): Coupon[] => getCatalog().coupons;

export const findCoupon = (code: string) =>
  getCatalog().coupons.find((c) => c.code === code.trim().toUpperCase()) ?? null;

export interface CouponContext {
  roomTotal: number;
  nights: number;
  checkIn: string;
  checkOut: string;
}

export interface CouponResult {
  ok: boolean;
  discount: number;
  reason?: string;
}

export function evaluateCoupon(c: Coupon, ctx: CouponContext): CouponResult {
  if (c.expired) return { ok: false, discount: 0, reason: `This promo code expired on ${c.expired}.` };
  if (c.minNights && ctx.nights < c.minNights) {
    return { ok: false, discount: 0, reason: `Add ${plural(c.minNights - ctx.nights, "more night")} to use this offer.` };
  }
  if (c.minSpend && ctx.roomTotal < c.minSpend) {
    return {
      ok: false,
      discount: 0,
      reason: `Needs ${money(c.minSpend)} in room charges — your booking is ${money(c.minSpend - ctx.roomTotal)} short.`,
    };
  }
  if (c.saturday && !includesSaturdayNight(ctx.checkIn, ctx.checkOut)) {
    return { ok: false, discount: 0, reason: "Valid for weekend stays that include a Saturday night." };
  }
  const raw = c.kind === "percent" ? Math.round((ctx.roomTotal * c.value) / 100) : c.value;
  return { ok: true, discount: Math.min(raw, c.cap ?? Infinity, ctx.roomTotal) };
}

export function bestCoupon(ctx: CouponContext): Coupon | null {
  let best: Coupon | null = null;
  let bestValue = 0;
  for (const c of getCatalog().coupons) {
    if (!c.listed) continue;
    const r = evaluateCoupon(c, ctx);
    if (r.ok && r.discount > bestValue) {
      best = c;
      bestValue = r.discount;
    }
  }
  return best;
}

/* ───────────── Extras / Add-ons (loaded from Redis via Spring Boot API) ───────────── */

export type AddonId = "breakfast" | "transfer" | "late";

export interface Addon {
  id: AddonId;
  title: string;
  desc: string;
  unit: string;
  price: number;
  billing: "PER_GUEST_PER_NIGHT" | "PER_ROOM" | "FLAT" | string;
}

export const getAddons = (): Addon[] => getCatalog().addons;
export const getAddon = (id: AddonId): Addon | undefined => getCatalog().addons.find((a) => a.id === id);

export function addonAmount(addon: Addon, nights: number, guests: number, rooms: number): number {
  if (addon.billing === "PER_GUEST_PER_NIGHT") return addon.price * nights * guests;
  if (addon.billing === "PER_ROOM") return addon.price * rooms;
  return addon.price;
}

/* ───────────── Quote (Indian GST Included) ───────────── */

export const TAX_RATE = 0.12;
export const taxPortion = (gross: number) => Math.round((gross * TAX_RATE) / (1 + TAX_RATE));

export interface Quote {
  nightly: number;
  nights: number;
  rooms: number;
  roomTotal: number;
  addons: { id: AddonId; title: string; amount: number }[];
  addonsTotal: number;
  discount: number;
  total: number;
  taxes: number;
  dueNow: number;
  dueLater: number;
}

export function buildQuote(input: {
  nightly: number;
  nights: number;
  rooms: number;
  guests: number;
  addons: AddonId[];
  discount: number;
  payLater: boolean;
}): Quote {
  const roomTotal = input.nightly * input.nights * input.rooms;
  const addons = input.addons
    .map((id) => {
      const a = getAddon(id);
      if (!a) return null;
      return { id, title: a.title, amount: addonAmount(a, input.nights, input.guests, input.rooms) };
    })
    .filter((x): x is { id: AddonId; title: string; amount: number } => x !== null);
  const addonsTotal = addons.reduce((s, a) => s + a.amount, 0);
  const discount = Math.min(input.discount, roomTotal);
  const total = roomTotal + addonsTotal - discount;
  return {
    nightly: input.nightly,
    nights: input.nights,
    rooms: input.rooms,
    roomTotal,
    addons,
    addonsTotal,
    discount,
    total,
    taxes: taxPortion(total),
    dueNow: input.payLater ? 0 : total,
    dueLater: input.payLater ? total : 0,
  };
}
