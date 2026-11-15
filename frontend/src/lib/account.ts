import { useSyncExternalStore } from "react";
import { api, ApiRequestError, getSessionToken, setSessionToken } from "./api";
import { resetSecureChannel } from "./secureChannel";
import { rotateGuestToken } from "./channelConfig";
import { fetchHotelDetail, getCatalog } from "./catalog";
import { toISO, today } from "./dates";
import { loadSaved, setSavedList } from "./store";

/* ────────────────────────────────────────────────────────────────────────────
   100% API-backed customer account, bookings, payments, reviews & chat store.
   All records live exclusively in Redis via the Spring Boot 4.1.2 REST API.
   ──────────────────────────────────────────────────────────────────────────── */

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  marketing: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  at: string;
  kind: "payment" | "refund";
}

export interface Review {
  score: number;
  scores: Record<string, number>;
  title: string;
  text: string;
  at: string;
}

export interface Message {
  id: string;
  from: "guest" | "property";
  text: string;
  at: string;
  read: boolean;
}

export interface Thread {
  ref: string;
  messages: Message[];
}

export interface Booking {
  ref: string;
  userId: string | null;
  hotelId: string;
  roomIndex: number;
  roomName: string;
  rateId: string;
  rateName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  arrival: string;
  requests: string[];
  notes: string;
  addons: { id: string; title: string; amount: number }[];
  roomTotal: number;
  addonsTotal: number;
  coupon: string | null;
  discount: number;
  total: number;
  taxes: number;
  payments: Payment[];
  paymentMethod: string;
  refundable: boolean;
  freeCancelUntil: string | null;
  cancelledAt: string | null;
  refundAmount: number;
  review: Review | null;
  createdAt: string;
  sample: boolean;
}

export type TripStatus = "upcoming" | "staying" | "completed" | "cancelled";

export const STATUS_LABEL: Record<TripStatus, string> = {
  upcoming: "Upcoming",
  staying: "Staying now",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface AuthResponse {
  token: string;
  user: User;
  bookings: Booking[];
  threads: Thread[];
  saved: string[];
}

export interface AccountState {
  ready: boolean;
  user: User | null;
  bookings: Booking[];
  threads: Thread[];
}

let state: AccountState = {
  ready: false,
  user: null,
  bookings: [],
  threads: [],
};

const listeners = new Set<() => void>();

function emit(next: AccountState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, () => state);
}

export const currentUser = (): User | null => state.user;
export const findBooking = (ref: string): Booking | null => state.bookings.find((b) => b.ref === ref) ?? null;

/** Only the public demo email is exposed; the credential itself never ships to the browser. */
export const getDemoCredentials = () => ({
  email: getCatalog().meta?.demoEmail ?? "demo@laorvia.com",
});

/* ───────── derived booking facts ───────── */

export const paidOf = (b: Booking) =>
  b.payments.reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount : p.amount), 0);

export const balanceDue = (b: Booking) => (b.cancelledAt ? 0 : Math.max(0, Math.round(b.total - paidOf(b))));

export function statusOf(b: Booking): TripStatus {
  if (b.cancelledAt) return "cancelled";
  const now = toISO(today());
  if (b.checkOut <= now) return "completed";
  if (b.checkIn <= now) return "staying";
  return "upcoming";
}

export const canReview = (b: Booking) => statusOf(b) === "completed" && !b.review;

export const nightsUntil = (b: Booking) => {
  const n = Math.round((new Date(b.checkIn).getTime() - new Date(toISO(today())).getTime()) / 86_400_000);
  return Number.isNaN(n) ? 0 : n;
};

export const unreadFrom = (threads: Thread[], ref: string) =>
  threads.find((t) => t.ref === ref)?.messages.filter((m) => m.from === "property" && !m.read).length ?? 0;

export const threadFor = (threads: Thread[], ref: string): Thread =>
  threads.find((t) => t.ref === ref) ?? { ref, messages: [] };

/* ───────── session bootstrap ───────── */

export async function initAccount() {
  const token = getSessionToken();
  if (!token) {
    emit({ ready: true, user: null, bookings: [], threads: [] });
    await loadSaved();
    return;
  }
  try {
    const res = await api.get<AuthResponse>("/auth/me");
    emit({ ready: true, user: res.user, bookings: res.bookings ?? [], threads: res.threads ?? [] });
    setSavedList(res.saved ?? []);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) {
      setSessionToken(null);
      resetSecureChannel();
    }
    emit({ ready: true, user: null, bookings: [], threads: [] });
    await loadSaved();
  }
}

/* ───────── auth ───────── */

type AuthResult = { ok: true; user: User } | { ok: false; error: string };

export interface SignUpInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  marketing?: boolean;
}

function applyAuth(res: AuthResponse): AuthResult {
  setSessionToken(res.token);
  emit({ ready: true, user: res.user, bookings: res.bookings ?? [], threads: res.threads ?? [] });
  setSavedList(res.saved ?? []);
  // Rotate guest identity and open a fresh channel: the server binds it to this customer,
  // this device, this browser profile and this exact bearer token on first use.
  rotateGuestToken();
  resetSecureChannel();
  return { ok: true, user: res.user };
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  try {
    const res = await api.post<AuthResponse>("/auth/signup", {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      password: input.password,
      marketing: !!input.marketing,
    });
    return applyAuth(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create account." };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const res = await api.post<AuthResponse>("/auth/login", { email: email.trim(), password });
    return applyAuth(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not sign in." };
  }
}

export async function signInDemo(): Promise<AuthResult> {
  try {
    const res = await api.post<AuthResponse>("/auth/demo");
    return applyAuth(res);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not sign into demo account." };
  }
}

export async function signOut() {
  try {
    await api.post("/auth/logout");
  } catch {
    /* the token is discarded locally regardless */
  }
  setSessionToken(null);
  rotateGuestToken();
  resetSecureChannel();
  emit({ ready: true, user: null, bookings: [], threads: [] });
  await loadSaved();
}

export async function updateProfile(
  patch: Pick<User, "firstName" | "lastName" | "phone" | "country" | "marketing">,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const updated = await api.put<User>("/auth/profile", patch);
    emit({ ...state, user: updated });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save profile." };
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await api.put("/auth/password", { currentPassword, newPassword });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update password." };
  }
}

export async function deleteAccount() {
  await api.delete("/auth/account");
  setSessionToken(null);
  rotateGuestToken();
  resetSecureChannel();
  emit({ ready: true, user: null, bookings: [], threads: [] });
  setSavedList([]);
}

/* ───────── bookings, payments, cancellations, reviews & chat ───────── */

export interface CreateBookingPayload {
  hotelId: string;
  roomIndex: number;
  rateId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  arrival: string;
  requests: string[];
  notes: string;
  addonIds: string[];
  couponCode: string | null;
  payLater: boolean;
  paymentMethod: string;
}

function replaceBooking(booking: Booking) {
  const exists = state.bookings.some((b) => b.ref === booking.ref);
  const bookings = exists
    ? state.bookings.map((b) => (b.ref === booking.ref ? booking : b))
    : [booking, ...state.bookings];
  emit({ ...state, bookings });
}

function replaceThread(thread: Thread) {
  const exists = state.threads.some((t) => t.ref === thread.ref);
  const threads = exists
    ? state.threads.map((t) => (t.ref === thread.ref ? thread : t))
    : [...state.threads, thread];
  emit({ ...state, threads });
}

export async function createBooking(payload: CreateBookingPayload): Promise<Booking> {
  const idempotencyKey = crypto.randomUUID();
  const booking = await api.post<Booking>("/bookings", payload, { idempotencyKey });
  if (state.user) {
    replaceBooking(booking);
    // Also fetch the initial welcome thread created by the backend
    try {
      const thread = await api.get<Thread>(`/bookings/${encodeURIComponent(booking.ref)}/messages`);
      replaceThread(thread);
    } catch {
      /* ignore */
    }
  }
  return booking;
}

export async function fetchBookingByRef(ref: string): Promise<Booking | null> {
  try {
    return await api.get<Booking>(`/bookings/${encodeURIComponent(ref)}`);
  } catch {
    return null;
  }
}

export async function refreshMyBookings(): Promise<void> {
  if (!state.user) return;
  try {
    const res = await api.get<{ bookings: Booking[]; threads: Thread[] }>("/bookings");
    emit({ ...state, bookings: res.bookings ?? [], threads: res.threads ?? [] });
  } catch {
    /* ignore */
  }
}

export async function payBooking(ref: string, method: string): Promise<{ paidAmount: number; booking: Booking }> {
  const res = await api.post<{ paidAmount: number; booking: Booking }>(
    `/bookings/${encodeURIComponent(ref)}/pay`,
    { method },
    { idempotencyKey: `pay-${ref}-${crypto.randomUUID()}` },
  );
  replaceBooking(res.booking);
  return res;
}

export async function cancelBooking(ref: string): Promise<{ refund: number; free: boolean; booking: Booking }> {
  const res = await api.post<{ refund: number; free: boolean }>(`/bookings/${encodeURIComponent(ref)}/cancel`) as {
    refund: number;
    free: boolean;
    booking: Booking;
  };
  replaceBooking(res.booking);
  return res;
}

export async function saveReview(
  ref: string,
  review: { score: number; scores: Record<string, number>; title: string; text: string },
): Promise<Booking> {
  const booking = await api.post<Booking>(`/bookings/${encodeURIComponent(ref)}/review`, review);
  replaceBooking(booking);
  // Refresh the property from Redis so the new verified review appears immediately
  fetchHotelDetail(booking.hotelId).catch(() => {});
  return booking;
}

export async function removeReview(ref: string): Promise<Booking> {
  const booking = await api.delete<Booking>(`/bookings/${encodeURIComponent(ref)}/review`);
  replaceBooking(booking);
  return booking;
}

export async function sendMessage(ref: string, text: string): Promise<Thread> {
  const thread = await api.post<Thread>(`/bookings/${encodeURIComponent(ref)}/messages`, { text });
  replaceThread(thread);
  // Poll Redis once after the Spring Boot async front-desk reply settles
  window.setTimeout(async () => {
    try {
      const fresh = await api.get<Thread>(`/bookings/${encodeURIComponent(ref)}/messages`);
      replaceThread(fresh);
    } catch {
      /* ignore */
    }
  }, 1600);
  return thread;
}

export async function markThreadRead(ref: string): Promise<void> {
  const existing = state.threads.find((t) => t.ref === ref);
  if (!existing || !existing.messages.some((m) => m.from === "property" && !m.read)) return;
  try {
    const updated = await api.post<Thread>(`/bookings/${encodeURIComponent(ref)}/messages/read`);
    replaceThread(updated);
  } catch {
    /* ignore */
  }
}
