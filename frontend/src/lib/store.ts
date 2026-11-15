import { useSyncExternalStore } from "react";
import { api } from "./api";

/**
 * Saved wishlist store — persisted exclusively in Redis via /api/v1/saved.
 */
const listeners = new Set<() => void>();
let saved: string[] = [];

function emit(next: string[]) {
  saved = next;
  listeners.forEach((l) => l());
}

export function setSavedList(list: string[]) {
  emit(list);
}

export async function loadSaved(): Promise<string[]> {
  try {
    const list = await api.get<string[]>("/saved");
    emit(list);
    return list;
  } catch {
    return saved;
  }
}

export async function toggleSaved(id: string) {
  const wasSaved = saved.includes(id);
  // Optimistic update, then reconcile with Redis response
  emit(wasSaved ? saved.filter((x) => x !== id) : [...saved, id]);
  try {
    const updated = wasSaved
      ? await api.delete<string[]>(`/saved/${encodeURIComponent(id)}`)
      : await api.post<string[]>(`/saved/${encodeURIComponent(id)}`);
    emit(updated);
  } catch {
    emit(wasSaved ? [...saved, id] : saved.filter((x) => x !== id));
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSaved() {
  return useSyncExternalStore(subscribe, () => saved);
}

/* Hand-off of last confirmed booking ref from checkout to the confirmation page. */
const LAST_REF_KEY = "laorvia:lastBookingRef";

export function saveLastBookingRef(ref: string) {
  try {
    sessionStorage.setItem(LAST_REF_KEY, ref);
  } catch {
    /* ignore */
  }
}

export function loadLastBookingRef(): string | null {
  try {
    return sessionStorage.getItem(LAST_REF_KEY);
  } catch {
    return null;
  }
}
