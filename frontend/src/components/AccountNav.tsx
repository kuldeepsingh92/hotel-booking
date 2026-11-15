import type { ReactNode } from "react";
import { Heart, House, LogOut, Luggage, UserRound } from "lucide-react";
import { cn } from "../utils/cn";
import { balanceDue, signOut, useAccount } from "../lib/account";
import { Link } from "../lib/router";
import { useSaved } from "../lib/store";

const TABS = [
  { id: "overview", label: "Overview", to: "/account", icon: House },
  { id: "trips", label: "My trips", to: "/account?tab=trips", icon: Luggage },
  { id: "saved", label: "Saved stays", to: "/account?tab=saved", icon: Heart },
  { id: "profile", label: "Profile", to: "/account?tab=profile", icon: UserRound },
];

export function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function AccountNav({ active }: { active: string }) {
  const { user, bookings } = useAccount();
  const saved = useSaved();
  if (!user) return null;
  const due = bookings.filter((b) => balanceDue(b) > 0 && !b.cancelledAt).length;

  return (
    <aside aria-label="Account">
      <div className="rounded-3xl border border-sand-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-pine-100 text-base font-bold text-pine-700">
            {initials(user.firstName, user.lastName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-sm text-ink-500">{user.email}</p>
          </div>
        </div>
      </div>

      <nav className="mt-4 grid grid-cols-2 gap-1 rounded-2xl border border-sand-200 bg-white p-2 lg:flex lg:flex-col lg:gap-0.5 lg:p-2" aria-label="Account sections">
        {TABS.map((t) => {
          const on = active === t.id;
          const count = t.id === "trips" && due > 0 ? due : t.id === "saved" ? saved.length : 0;
          return (
            <Link
              key={t.id}
              to={t.to}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors lg:w-full lg:rounded-xl",
                on ? "bg-ink text-white" : "text-ink-700 hover:bg-sand-100",
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
              {count > 0 && (
                <span className={cn("ml-auto rounded-full px-1.5 text-xs tabular-nums", on ? "bg-white/20" : t.id === "trips" ? "bg-ember-600 text-white" : "bg-sand-100 text-ink-600")}>
                  {count}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={async () => {
            await signOut();
            window.location.hash = "/";
          }}
          className="col-span-2 inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-500 transition-colors hover:bg-sand-100 hover:text-ink lg:col-span-1 lg:mt-1 lg:w-full lg:border-t lg:border-sand-200 lg:pt-3"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </nav>

      <div className="mt-4 hidden rounded-2xl bg-pine-800 p-5 text-white lg:block">
        <p className="display text-xl">A question about a stay?</p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/70">
          Open the trip and message the property directly — replies are saved in Redis on the same thread.
        </p>
        <Link to="/account?tab=trips" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">
          Go to my trips
        </Link>
      </div>
    </aside>
  );
}

export function AccountTitle({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <p className="eyebrow text-pine-600">{eyebrow}</p>
        <h2 className="display mt-2 text-[clamp(2rem,4vw,2.9rem)] leading-[1.05]">{title}</h2>
      </div>
      {children}
    </div>
  );
}
