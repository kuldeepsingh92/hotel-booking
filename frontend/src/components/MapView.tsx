import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "../utils/cn";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  /** Short text shown in the pin, e.g. a price. */
  label: string;
  title: string;
}

/** Leaflet map with price pins on OpenStreetMap tiles (no API key needed). */
export function MapView({
  pins, activeId, onSelect, className, interactive = true,
}: {
  pins: MapPin[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  interactive?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const key = pins.map((p) => `${p.id}:${p.label}`).join("|");
  const shape = pins.map((p) => p.id).join("|");

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, scrollWheelZoom: interactive, attributionControl: true });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);
    m.setView([25, 10], 2);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    const store = markers.current;
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      store.clear();
    };
  }, [interactive]);

  // (Re)draw pins when the set or their labels change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current.clear();
    pins.forEach((p) => {
      const icon = L.divIcon({ className: "pin-wrap", html: `<span class="pin">${p.label}</span>`, iconSize: [0, 0] });
      const mk = L.marker([p.lat, p.lng], { icon, title: p.title, alt: p.title, keyboard: true, riseOnHover: true }).addTo(m);
      mk.on("click", () => selectRef.current?.(p.id));
      mk.on("keypress", (e) => {
        if ((e as L.LeafletKeyboardEvent).originalEvent.key === "Enter") selectRef.current?.(p.id);
      });
      markers.current.set(p.id, mk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, interactive]);

  // Refit only when the set of places changes, not on label changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !pins.length) return;
    if (pins.length === 1) m.setView([pins[0].lat, pins[0].lng], 15);
    else m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [56, 56], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, interactive]);

  useEffect(() => {
    markers.current.forEach((mk, id) => {
      mk.getElement()?.classList.toggle("is-active", id === activeId);
      mk.setZIndexOffset(id === activeId ? 1000 : 0);
    });
  }, [activeId, key]);

  return <div ref={el} className={cn("map-root", className)} role="application" aria-label="Map of stays" />;
}
