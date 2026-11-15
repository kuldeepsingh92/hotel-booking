import { useMemo, useSyncExternalStore, type AnchorHTMLAttributes } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function getHash() {
  return window.location.hash.slice(1) || "/";
}

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

/** Minimal hash router: `#/search?dest=lisbon` → { path: "/search", query } */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return useMemo(() => {
    const [rawPath, qs = ""] = hash.split("?");
    const path = rawPath || "/";
    return { path, segments: path.split("/").filter(Boolean), query: new URLSearchParams(qs) };
  }, [hash]);
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  if (opts?.replace) {
    const url = window.location.pathname + window.location.search + "#" + to;
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event("hashchange"));
  } else {
    window.location.hash = to;
  }
}

export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={"#" + to} {...rest} />;
}
