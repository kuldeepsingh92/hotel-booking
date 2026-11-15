import { getCatalog } from "../lib/catalog";

/**
 * Pure TypeScript types and accessors backed exclusively by Redis via Spring Boot 4.1.2 API.
 * Zero static hotel, city, or landmark datasets live in the frontend.
 */

export type PropertyType =
  | "Heritage Palace"
  | "Boutique Haveli"
  | "Luxury Resort"
  | "Private Villa"
  | "Hill Chalet"
  | "Estate Bungalow"
  | "Boutique Hotel"
  | "Riverside Retreat";

export type AmenityKey =
  | "wifi"
  | "pool"
  | "spa"
  | "gym"
  | "parking"
  | "restaurant"
  | "bar"
  | "ac"
  | "pets"
  | "beach"
  | "kitchen"
  | "shuttle"
  | "view"
  | "family";

export interface City {
  id: string;
  name: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
  centre: string;
  image: number;
  line: string;
}

export type RateId = "nr" | "fx" | "fb";

export interface RatePlan {
  id: RateId;
  name: string;
  price: number;
  refundable: boolean;
  breakfast: boolean;
  payAtProperty: boolean;
}

export interface Room {
  name: string;
  size: number;
  bed: string;
  sleeps: number;
  image: number;
  features: string[];
  rates: RatePlan[];
}

export interface Review {
  name: string;
  country: string;
  trip: string;
  title: string;
  text: string;
  score: number;
  monthsAgo: number;
}

export interface Hotel {
  id: string;
  name: string;
  cityId: string;
  area: string;
  type: PropertyType;
  stars: number;
  rating: number;
  reviews: number;
  price: number;
  wasPrice: number | null;
  deal: number;
  lat: number;
  lng: number;
  distance: number;
  amenities: AmenityKey[];
  highlights: AmenityKey[];
  breakfast: "included" | "optional" | "none";
  flex: boolean;
  tags: string[];
  blurb: string;
  images: { id: number; label: string }[];
  rooms: Room[];
  scores: { label: string; value: number }[];
  guestReviews: Review[];
  checkInTime: string;
  checkOutTime: string;
}

export interface Landmark {
  name: string;
  lat: number;
  lng: number;
}

export interface NearbyPlace {
  name: string;
  km: number;
  time: string;
  walk: boolean;
}

export interface PropertyHost {
  name: string;
  role: string;
  phone?: string;
}

export const getCities = () => getCatalog().cities;
export const getHotels = () => getCatalog().hotels;
export const getHotel = (id: string | undefined) => getCatalog().hotels.find((h) => h.id === id) ?? null;
export const getCity = (id: string): City =>
  getCatalog().cities.find((c) => c.id === id) ??
  getCatalog().cities[0] ?? {
    id,
    name: id,
    state: "",
    country: "India",
    lat: 24.5854,
    lng: 73.7125,
    centre: "",
    image: 0,
    line: "",
  };
export const hotelsIn = (cityId: string) =>
  cityId ? getCatalog().hotels.filter((h) => h.cityId === cityId) : getCatalog().hotels;

export const getAmenityLabel = (key: AmenityKey) => getCatalog().meta?.amenities?.[key] ?? key;
export const getPropertyTypes = (): PropertyType[] => getCatalog().meta?.propertyTypes ?? [];
export const getFilterAmenities = (): AmenityKey[] => getCatalog().meta?.filterAmenities ?? [];
export const getHost = (cityId: string): PropertyHost =>
  getCatalog().hosts[cityId] ?? { name: "Guest Relations Desk", role: "Property Team", phone: "+91 22 4100 8800" };

export const ratingLabel = (r: number) =>
  r >= 9.5 ? "Exceptional" : r >= 9 ? "Superb" : r >= 8.5 ? "Fabulous" : r >= 8 ? "Very good" : "Good";

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dx = (lng2 - lng1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180) * 111.32;
  const dy = (lat2 - lat1) * 110.57;
  return Math.sqrt(dx * dx + dy * dy);
}

export function nearbyFor(hotel: Hotel): NearbyPlace[] {
  const list = getCatalog().landmarks[hotel.cityId] ?? [];
  return list.map(({ name, lat, lng }) => {
    const km = kmBetween(hotel.lat, hotel.lng, lat, lng);
    const time = km < 1.6 ? `${Math.max(2, Math.round(km * 13))} min walk` : `${Math.round(km * 2.2 + 4)} min drive`;
    return { name, km: Math.round(km * 10) / 10, time, walk: km < 1.6 };
  });
}
