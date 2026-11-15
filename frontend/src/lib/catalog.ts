import { useSyncExternalStore } from "react";
import { api, ApiRequestError } from "./api";
import type { BlogArticle } from "../data/blogs";
import type { AmenityKey, City, Hotel, Landmark, NearbyPlace, PropertyHost, PropertyType } from "../data/hotels";
import type { Addon, Coupon, CouponEvaluateResponse } from "./pricing";

export interface Testimonial {
  name: string;
  location: string;
  role: string;
  hotelName: string;
  avatar: number;
  quote: string;
  tag: string;
  rating: number;
}

export interface HomeFaq {
  q: string;
  a: string;
}

export interface HomePromise {
  icon: "receipt" | "zap" | "shield" | "badge" | string;
  title: string;
  text: string;
}

export interface HomeTab {
  id: string;
  label: string;
}

export interface HomeContent {
  testimonials: Testimonial[];
  faqs: HomeFaq[];
  promises: HomePromise[];
  tabs: HomeTab[];
}

export interface PortalMeta {
  propertyTypes: PropertyType[];
  amenities: Record<AmenityKey, string>;
  filterAmenities: AmenityKey[];
  specialRequests: string[];
  banks: string[];
  countries: string[];
  heroHotelId: string;
  sampleReceiptHotelId: string;
  trendingCityIds: string[];
  demoEmail: string;
}

export interface SeedInfo {
  version: string;
  seededAt: string;
  cities: number;
  hotels: number;
  blogs: number;
  coupons: number;
  addons: number;
  demoEmail: string;
}

export interface HealthResponse {
  status: string;
  redis: string;
  latencyMs: number;
  seeded: boolean;
  seedInfo: SeedInfo | null;
  counts: Record<string, number>;
}

export interface BootstrapResponse {
  cities: City[];
  hotels: Hotel[];
  landmarks: Record<string, Landmark[]>;
  hosts: Record<string, PropertyHost>;
  coupons: Coupon[];
  addons: Addon[];
  blogs: BlogArticle[];
  home: HomeContent;
  meta: PortalMeta | null;
  seedInfo: SeedInfo | null;
}

export interface HotelDetailResponse {
  hotel: Hotel;
  city: City;
  nearby: NearbyPlace[];
  similar: Hotel[];
  host: PropertyHost;
}

export interface BlogDetailResponse {
  blog: BlogArticle;
  curatedHotels: Hotel[];
  related: BlogArticle[];
}

export interface CatalogState {
  status: "loading" | "ready" | "error";
  error: string | null;
  errorCode: string | null;
  cities: City[];
  hotels: Hotel[];
  landmarks: Record<string, Landmark[]>;
  hosts: Record<string, PropertyHost>;
  coupons: Coupon[];
  addons: Addon[];
  blogs: BlogArticle[];
  home: HomeContent;
  meta: PortalMeta | null;
  seedInfo: SeedInfo | null;
  health: HealthResponse | null;
}

const EMPTY_HOME: HomeContent = { testimonials: [], faqs: [], promises: [], tabs: [] };

let state: CatalogState = {
  status: "loading",
  error: null,
  errorCode: null,
  cities: [],
  hotels: [],
  landmarks: {},
  hosts: {},
  coupons: [],
  addons: [],
  blogs: [],
  home: EMPTY_HOME,
  meta: null,
  seedInfo: null,
  health: null,
};

const listeners = new Set<() => void>();

function emit(next: CatalogState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getCatalog(): CatalogState {
  return state;
}

export function useCatalog(): CatalogState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Hydrate the entire catalog strictly from Spring Boot 4.1.2 + Redis. */
export async function loadCatalog(): Promise<boolean> {
  emit({ ...state, status: "loading", error: null, errorCode: null });
  try {
    const [bootstrap, health] = await Promise.all([
      api.get<BootstrapResponse>("/bootstrap"),
      api.get<HealthResponse>("/health").catch(() => null),
    ]);
    emit({
      status: "ready",
      error: null,
      errorCode: null,
      cities: bootstrap.cities ?? [],
      hotels: bootstrap.hotels ?? [],
      landmarks: bootstrap.landmarks ?? {},
      hosts: bootstrap.hosts ?? {},
      coupons: bootstrap.coupons ?? [],
      addons: bootstrap.addons ?? [],
      blogs: bootstrap.blogs ?? [],
      home: bootstrap.home ?? EMPTY_HOME,
      meta: bootstrap.meta ?? null,
      seedInfo: bootstrap.seedInfo ?? null,
      health,
    });
    return true;
  } catch (err) {
    const apiErr = err instanceof ApiRequestError ? err : null;
    emit({
      ...state,
      status: "error",
      errorCode: apiErr?.code ?? "ERROR",
      error: err instanceof Error ? err.message : "Failed to load data from Spring Boot API.",
    });
    return false;
  }
}

/** Update a single hotel in the live store (e.g. after submitting a review). */
export function upsertHotel(hotel: Hotel) {
  const exists = state.hotels.some((h) => h.id === hotel.id);
  const hotels = exists
    ? state.hotels.map((h) => (h.id === hotel.id ? hotel : h))
    : [...state.hotels, hotel];
  emit({ ...state, hotels });
}

/* ───────────── Live per-page Redis API queries ───────────── */

export interface SearchHotelsParams {
  dest?: string;
  minPrice?: number;
  maxPrice?: number;
  freeCancel?: boolean;
  breakfast?: boolean;
  minRating?: number;
  stars?: number[];
  types?: string[];
  amenities?: string[];
  tag?: string;
  sort?: string;
}

export async function fetchHotels(params: SearchHotelsParams): Promise<Hotel[]> {
  const q = new URLSearchParams();
  if (params.dest) q.set("dest", params.dest);
  if (params.minPrice !== undefined) q.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) q.set("maxPrice", String(params.maxPrice));
  if (params.freeCancel) q.set("freeCancel", "true");
  if (params.breakfast) q.set("breakfast", "true");
  if (params.minRating && params.minRating > 0) q.set("minRating", String(params.minRating));
  params.stars?.forEach((s) => q.append("stars", String(s)));
  params.types?.forEach((t) => q.append("types", t));
  params.amenities?.forEach((a) => q.append("amenities", a));
  if (params.tag) q.set("tag", params.tag);
  if (params.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return api.get<Hotel[]>(`/hotels${qs ? `?${qs}` : ""}`);
}

export async function fetchHotelDetail(id: string): Promise<HotelDetailResponse> {
  const res = await api.get<HotelDetailResponse>(`/hotels/${encodeURIComponent(id)}`);
  if (res.hotel) upsertHotel(res.hotel);
  return res;
}

export async function fetchBlogs(category?: string, query?: string): Promise<BlogArticle[]> {
  const q = new URLSearchParams();
  if (category && category !== "All Guides") q.set("category", category);
  if (query && query.trim()) q.set("q", query.trim());
  const qs = q.toString();
  return api.get<BlogArticle[]>(`/blogs${qs ? `?${qs}` : ""}`);
}

export async function fetchBlogDetail(slug: string): Promise<BlogDetailResponse> {
  return api.get<BlogDetailResponse>(`/blogs/${encodeURIComponent(slug)}`);
}

export async function evaluateCouponApi(req: {
  code: string;
  roomTotal: number;
  nights: number;
  checkIn: string;
  checkOut: string;
}): Promise<CouponEvaluateResponse> {
  return api.post<CouponEvaluateResponse>("/coupons/evaluate", req);
}
