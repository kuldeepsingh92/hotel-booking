import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check as CheckIcon, Eye, EyeOff, Heart, KeyRound, Send, ShieldCheck } from "lucide-react";
import { cn } from "../utils/cn";
import { currentUser, getDemoCredentials, signIn, signInDemo, signUp } from "../lib/account";
import { Link, navigate } from "../lib/router";
import { Logo } from "../components/Header";
import { Img, btnClass } from "../components/ui";

const PERKS = [
  { icon: Heart, text: "Every trip, receipt and request in one place." },
  { icon: Send, text: "Message your property before you arrive." },
  { icon: KeyRound, text: "Pay a balance or cancel without an email chain." },
];

type Mode = "signin" | "signup";

function passwordStrength(p: string) {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return Math.min(4, score);
}

export function AuthPage({ mode, query }: { mode: Mode; query: URLSearchParams }) {
  const rawNext = query.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [terms, setTerms] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const signingIn = mode === "signin";
  const demoCreds = getDemoCredentials();

  useEffect(() => {
    if (currentUser()) navigate(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (signingIn) {
      if (!email.trim() || !password) {
        setFieldErrors({ email: !email.trim() ? "Enter the email you signed up with." : "", password: !password ? "Enter your password." : "" });
        return;
      }
      setBusy(true);
      const res = await signIn(email, password);
      setBusy(false);
      if (!res.ok) return setError(res.error);
      navigate(next);
      return;
    }

    const fe: Record<string, string> = {};
    if (!firstName.trim()) fe.firstName = "We'll use this on your confirmation.";
    if (!lastName.trim()) fe.lastName = "We'll use this on your confirmation.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) fe.email = "Enter an email you can access — like name@example.com.";
    if (password.length < 8) fe.password = "Use at least 8 characters.";
    if (!terms) fe.terms = "Please accept the booking terms to create an account.";
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    const res = await signUp({ firstName, lastName, email, password, marketing });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    navigate(next);
  };

  const demo = async () => {
    setBusy(true);
    const res = await signInDemo();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    navigate(next);
  };

  const strength = passwordStrength(password);
  const strengthLabel = ["Too short", "Okay", "Good", "Strong", "Excellent"][strength];

  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[1.02fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <Img id={38710745} w={1100} h={1500} alt="A whitewashed suite terrace overlooking the Aegean" eager className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-pine-900/90 via-pine-900/35 to-ink/20" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Logo light />
          <div className="max-w-md">
            <p className="eyebrow text-pine-200">Your stays, in one place</p>
            <p className="display mt-4 text-[clamp(2.2rem,3.6vw,3.2rem)] leading-[1.04]">
              The key to every trip you've booked with us.
            </p>
            <ul className="mt-8 space-y-3.5">
              {PERKS.map((p) => (
                <li key={p.text} className="flex items-start gap-3 text-[15px] text-white/85">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/12">
                    <p.icon className="size-4" aria-hidden />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
          <figure className="max-w-md rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <blockquote className="text-[15px] leading-relaxed text-white/90">
              “Being able to message the riad about our late arrival, and pay the balance the week before, took all the admin out of the trip.”
            </blockquote>
            <figcaption className="mt-2.5 text-sm text-white/60">Meera & Aarav Sharma · Bengaluru, stayed in Udaipur</figcaption>
          </figure>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-7 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Link to="/" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden />
            Back to stays
          </Link>
        </div>

        <div className="mx-auto my-auto w-full max-w-[25rem] py-10">
          <div className="flex rounded-full bg-sand-100 p-1" role="tablist" aria-label="Account">
            {(
              [
                { id: "signin" as Mode, label: "Sign in", to: `/login?next=${encodeURIComponent(next)}` },
                { id: "signup" as Mode, label: "Create account", to: `/signup?next=${encodeURIComponent(next)}` },
              ] as const
            ).map((t) => (
              <Link
                key={t.id}
                to={t.to}
                role="tab"
                aria-selected={mode === t.id}
                className={cn(
                  "inline-flex h-10 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  mode === t.id ? "bg-white text-ink shadow-soft" : "text-ink-500 hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>

          <h1 className="display mt-8 text-[clamp(2.1rem,4.6vw,2.8rem)] leading-[1.03]">
            {signingIn ? "Welcome back." : "Create your account."}
          </h1>
          <p className="mt-2 text-[15px] text-ink-500">
            {signingIn ? "Sign in to pay a balance, message a property or write a review." : "Free to join. Your trips, saved stays and messages live here."}
          </p>

          <form onSubmit={submit} noValidate className="mt-7 space-y-4">
            {error && (
              <p role="alert" className="rounded-xl bg-ember-50 p-3 text-sm font-medium text-ember-700">
                {error}
              </p>
            )}

            {!signingIn && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-1.5 block text-sm font-semibold">First name</label>
                  <input id="firstName" className="field" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} aria-invalid={!!fieldErrors.firstName} aria-describedby={fieldErrors.firstName ? "firstName-err" : undefined} />
                  {fieldErrors.firstName && <p id="firstName-err" className="mt-1.5 text-sm text-danger">{fieldErrors.firstName}</p>}
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1.5 block text-sm font-semibold">Last name</label>
                  <input id="lastName" className="field" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} aria-invalid={!!fieldErrors.lastName} aria-describedby={fieldErrors.lastName ? "lastName-err" : undefined} />
                  {fieldErrors.lastName && <p id="lastName-err" className="mt-1.5 text-sm text-danger">{fieldErrors.lastName}</p>}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">Email</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className="field"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-err" : undefined}
              />
              {fieldErrors.email && <p id="email-err" className="mt-1.5 text-sm text-danger">{fieldErrors.email}</p>}
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="password" className="block text-sm font-semibold">Password</label>
                {signingIn && (
                  <button
                    type="button"
                    onClick={() => setNotice(email.trim() ? `If an account exists for ${email.trim()}, a reset link is on its way. (Prototype: no email is sent.)` : "Enter your email first, then choose “Forgot password”.")}
                    className="text-sm font-semibold text-pine-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={reveal ? "text" : "password"}
                  autoComplete={signingIn ? "current-password" : "new-password"}
                  className="field pr-12"
                  placeholder={signingIn ? "Your password" : "At least 8 characters"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? "password-err" : !signingIn ? "password-hint" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-500 hover:text-ink"
                >
                  {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </div>
              {fieldErrors.password ? (
                <p id="password-err" className="mt-1.5 text-sm text-danger">{fieldErrors.password}</p>
              ) : !signingIn ? (
                <div id="password-hint" className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={cn("h-1 flex-1 rounded-full", i < strength ? (strength <= 1 ? "bg-ember-500" : strength === 2 ? "bg-gold" : "bg-pine-500") : "bg-sand-200")} />
                    ))}
                  </div>
                  <span className="text-xs text-ink-500">{password ? strengthLabel : "8+ characters"}</span>
                </div>
              ) : null}
            </div>

            {notice && <p role="status" className="rounded-xl bg-sand-50 p-3 text-sm text-ink-700">{notice}</p>}

            {signingIn ? (
              <label className="flex items-center gap-2.5 pt-1 text-sm text-ink-700">
                <input type="checkbox" defaultChecked className="size-4 rounded border-sand-300 accent-pine-600" />
                Keep me signed in on this device
              </label>
            ) : (
              <>
                <label className="flex items-start gap-2.5 pt-1 text-sm text-ink-700">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-4 rounded border-sand-300 accent-pine-600" aria-invalid={!!fieldErrors.terms} />
                  <span>
                    I agree to Linden's <span className="font-medium underline underline-offset-2">booking terms</span> and the property's house rules.
                    {fieldErrors.terms && <span className="mt-1 block text-danger">{fieldErrors.terms}</span>}
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm text-ink-700">
                  <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 rounded border-sand-300 accent-pine-600" />
                  <span>Send me occasional offers. No more than twice a month.</span>
                </label>
              </>
            )}

            <button type="submit" disabled={busy} className={btnClass("primary", "lg", "w-full")}>
              {busy ? (
                "Just a moment…"
              ) : signingIn ? (
                <>
                  Sign in
                  <ArrowRight className="size-4" aria-hidden />
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-ink-400">
            <span className="h-px flex-1 bg-sand-200" aria-hidden />
            or
            <span className="h-px flex-1 bg-sand-200" aria-hidden />
          </div>

          <div className="rounded-2xl border border-dashed border-sand-300 p-4">
            <p className="flex items-start gap-2 text-sm font-semibold">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-pine-600" aria-hidden />
              Try the demo account
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Five sample trips, one balance waiting to be paid, a stay ready for a review and a message from a host. No sign-up needed.
            </p>
            <p className="mt-2 font-mono text-xs text-ink-500">
              {demoCreds.email} · one-tap secure demo sign-in
            </p>
            <button type="button" onClick={demo} disabled={busy} className={btnClass("outline", "sm", "mt-3 w-full")}>
              <CheckIcon className="size-4" aria-hidden />
              Open the demo account
            </button>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-ink-400">
            Accounts, sessions, bookings, and messages are stored live in Redis via the Laorvia Spring Boot 4.1.2 API.
          </p>
        </div>
      </main>
    </div>
  );
}
