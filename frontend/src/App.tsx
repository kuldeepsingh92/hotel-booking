import { useCallback, useEffect } from "react";
import { getBlog } from "./data/blogs";
import { getCity, getHotel } from "./data/hotels";
import { initAccount, useAccount } from "./lib/account";
import { loadCatalog, useCatalog } from "./lib/catalog";
import { useRoute } from "./lib/router";
import { ApiGate } from "./components/ApiGate";
import Account from "./pages/Account";
import AccountBooking from "./pages/AccountBooking";
import { AuthPage } from "./pages/Auth";
import BlogDetail from "./pages/BlogDetail";
import BlogList from "./pages/BlogList";
import BookingPage from "./pages/Booking";
import Confirmation from "./pages/Confirmation";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import PropertyPage from "./pages/Property";
import SearchPage from "./pages/Search";

/**
 * Routes (hash-based so the built frontend works from any host):
 *   #/                          Home
 *   #/search?dest&in&out…       Search results (live Redis query via Spring Boot)
 *   #/hotel/:id?…               Property details (live Redis query via Spring Boot)
 *   #/book/:id?…&room&rate      Checkout (creates booking in Redis)
 *   #/confirmation              Booking confirmed (fetched from Redis)
 *   #/login, #/signup           Account access (Redis sessions)
 *   #/account?tab=…             Trips, saved stays, profile
 *   #/account/bookings/:ref     One booking: pay balance, message host, review, cancel
 *   #/blog                      Editorial travel stories & GST guides (from Redis)
 *   #/blog/:slug                Full blog article (from Redis)
 */
export default function App() {
  const route = useRoute();
  const catalog = useCatalog();
  const { user } = useAccount();
  const signedIn = !!user;
  const [root, id, sub] = route.segments;

  const bootstrap = useCallback(async () => {
    const ok = await loadCatalog();
    if (ok) {
      await initAccount();
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route.path]);

  useEffect(() => {
    if (catalog.status !== "ready") return;
    const hotel = getHotel(id);
    const blog = root === "blog" && id ? getBlog(id) : null;
    const dest = route.query.get("dest");
    document.title =
      root === "search"
        ? `Verified Stays in ${dest ? getCity(dest).name : "India"} — Laorvia`
        : root === "hotel" && hotel
          ? `${hotel.name}, ${getCity(hotel.cityId).name} — Laorvia`
          : root === "book" && hotel
            ? `Checkout · ${hotel.name} — Laorvia`
            : root === "confirmation"
              ? "Booking Confirmed — Laorvia"
              : root === "blog"
                ? blog
                  ? `${blog.title} — Laorvia Travel Guides`
                  : "Travel Guides & Hotel GST Advice — Laorvia"
                : root === "login"
                  ? "Sign In — Laorvia"
                  : root === "signup"
                    ? "Create Account — Laorvia"
                    : root === "account"
                      ? id === "bookings"
                        ? "Your Booking Details — Laorvia"
                        : "My Trips & Account — Laorvia"
                      : "Laorvia — India's Most Transparent Hotel Booking Platform";
  }, [catalog.status, root, id, route.query]);

  if (catalog.status !== "ready") {
    return <ApiGate onRetry={bootstrap} />;
  }

  const current = route.path + (route.query.toString() ? `?${route.query.toString()}` : "");
  const nextQuery = new URLSearchParams({ next: current && current !== "/" ? current : "/account" });

  let page;
  if (!root) page = <Home query={route.query} />;
  else if (root === "search") page = <SearchPage query={route.query} />;
  else if (root === "hotel") page = <PropertyPage id={id} query={route.query} />;
  else if (root === "book") page = <BookingPage id={id} query={route.query} />;
  else if (root === "confirmation") page = <Confirmation />;
  else if (root === "blog" && !id) page = <BlogList />;
  else if (root === "blog" && id) page = <BlogDetail slug={id} />;
  else if (root === "login") page = <AuthPage mode="signin" query={route.query} />;
  else if (root === "signup") page = <AuthPage mode="signup" query={route.query} />;
  else if (root === "account" && id === "bookings") {
    page = signedIn ? (
      <AccountBooking ref={sub} query={route.query} />
    ) : (
      <AuthPage mode="signin" query={nextQuery} />
    );
  } else if (root === "account") {
    page = signedIn ? <Account query={route.query} /> : <AuthPage mode="signin" query={nextQuery} />;
  } else page = <NotFound />;

  return (
    <div key={route.path} className="animate-fade">
      {page}
    </div>
  );
}
