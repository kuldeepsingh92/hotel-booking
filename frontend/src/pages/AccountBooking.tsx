import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUpRight, BedDouble, CalendarPlus, Check as CheckIcon, ChevronRight, Clock,
  Copy, CreditCard, Info, Lock, Mail, MapPin, MessageSquare, Navigation, Pencil, Phone, Printer, Receipt, Send,
  ShieldCheck, Star, Trash2, Users, Wallet,
} from "lucide-react";
import { cn } from "../utils/cn";
import { getCity, getHost, getHotel, nearbyFor, ratingLabel } from "../data/hotels";
import {
  balanceDue, canReview, cancelBooking, markThreadRead, nightsUntil, paidOf, payBooking, removeReview,
  saveReview, sendMessage, statusOf, threadFor, unreadFrom, useAccount, type Booking,
} from "../lib/account";
import { useCatalog } from "../lib/catalog";
import { fmtLong, fmtMed, toISO, today } from "../lib/dates";
import { money, plural } from "../lib/format";
import { cardBrand, digits, expiryError, formatCard, formatExp, luhn } from "../lib/payment";
import { Link } from "../lib/router";
import { Header, Footer } from "../components/Header";
import { StatusPill } from "../components/BookingBits";
import { Img, Modal, ScoreChip, Stars, btnClass } from "../components/ui";

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function calendarFor(b: Booking, hotelName: string, area: string, city: string) {
  const stampNow = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Laorvia//Booking//EN",
    "BEGIN:VEVENT", `UID:${b.ref}@laorvia.com`, `DTSTAMP:${stampNow}`,
    `DTSTART;VALUE=DATE:${b.checkIn.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${b.checkOut.replace(/-/g, "")}`,
    `SUMMARY:Stay at ${hotelName}`,
    `LOCATION:${hotelName}\\, ${area}\\, ${city}`,
    `DESCRIPTION:Confirmation ${b.ref}. Check-in from 3 pm.`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `laorvia-${b.ref}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ───────── pay dialog ───────── */

type PayMethod = "upi" | "card" | "netbanking";

function PayDialog({
  open, onClose, booking, onPaid,
}: { open: boolean; onClose: () => void; booking: Booking; onPaid: (amount: number, method: string) => void }) {
  const { meta } = useCatalog();
  const banks = meta?.banks ?? ["HDFC Bank"];
  const due = balanceDue(booking);
  const [method, setMethod] = useState<PayMethod>("upi");
  const [upiId, setUpiId] = useState("");
  const [bank, setBank] = useState(banks[0] ?? "HDFC Bank");
  const [card, setCard] = useState({ number: "", name: "", exp: "", cvc: "" });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState("");

  useEffect(() => {
    if (open) {
      setMethod("upi");
      setPayError("");
      setUpiId("");
      setTouched(false);
      setBusy(false);
      setCard({ number: "", name: "", exp: "", cvc: "" });
    }
  }, [open]);

  const n = digits(card.number);
  const brand = cardBrand(n);
  const cvcLen = brand === "Amex" ? 4 : 3;
  const errors = {
    number: !n ? "Enter your card number." : !luhn(n) ? "That card number doesn't add up. Check the digits." : "",
    name: card.name.trim() ? "" : "Enter the name printed on the card.",
    exp: expiryError(card.exp),
    cvc: digits(card.cvc).length === cvcLen ? "" : `Enter the ${cvcLen}-digit code.`,
  };
  const firstError = Object.values(errors).find(Boolean);

  const submit = async () => {
    setTouched(true);
    if (method === "card" && firstError) return;
    setBusy(true);
    try {
      const label =
        method === "upi" ? (upiId.trim() ? `UPI (${upiId.trim()})` : "UPI (Google Pay / PhonePe)") : method === "netbanking" ? `NetBanking (${bank})` : `${brand ?? "Card"} ending ${n.slice(-4)}`;
      const res = await payBooking(booking.ref, label);
      onPaid(res.paidAmount || due, label);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Payment could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const methods: { id: PayMethod; label: string; mark: string }[] = [
    { id: "upi", label: "UPI (Google Pay, PhonePe, Paytm, CRED)", mark: "UPI" },
    { id: "card", label: "Credit / Debit Card (RuPay, Visa, Mastercard)", mark: "RuPay" },
    { id: "netbanking", label: "NetBanking (50+ Indian Banks)", mark: "NB" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pay your balance"
      footer={
        <div className="flex flex-col gap-2">
          <button type="button" onClick={submit} disabled={busy} className={btnClass("primary", "lg", "w-full")}>
            {busy ? "Processing…" : <><Lock className="size-4" aria-hidden /> Pay {money(due)}</>}
          </button>
          <p className="text-center text-xs text-ink-500">Prototype only — no card is charged. Use 4242 4242 4242 4242.</p>
        </div>
      }
    >
      <div className="py-4">
        <div className="flex items-baseline justify-between rounded-2xl bg-sand-50 p-4">
          <div>
            <p className="text-sm font-semibold">Balance for {booking.ref}</p>
            <p className="text-sm text-ink-500">{booking.roomName} · {plural(booking.nights, "night")}</p>
          </div>
          <p className="text-2xl font-bold tabular-nums">{money(due)}</p>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold">Payment method</legend>
          <div className="space-y-2">
            {methods.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition-colors",
                  method === m.id ? "border-pine-600 bg-pine-50/40 ring-1 ring-pine-600" : "border-sand-300 hover:border-ink-400",
                )}
              >
                <input type="radio" name="pay-method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="peer sr-only" />
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border border-sand-300 bg-white peer-checked:border-pine-600 [&>span]:scale-0 peer-checked:[&>span]:scale-100">
                  <span className="size-2.5 rounded-full bg-pine-600 transition-transform" />
                </span>
                <span className="flex-1 text-sm font-semibold">{m.label}</span>
                <span aria-hidden className="grid h-6 min-w-10 place-items-center rounded-md border border-sand-300 bg-white px-1.5 text-[10px] font-bold text-ink-700">{m.mark}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {method === "card" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="pay-number" className="mb-1.5 block text-sm font-semibold">Card number</label>
              <input
                id="pay-number" className="field" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456"
                value={card.number} onChange={(e) => setCard((c) => ({ ...c, number: formatCard(e.target.value) }))}
                aria-invalid={touched && !!errors.number} aria-describedby={touched && errors.number ? "pay-number-err" : undefined}
              />
              {touched && errors.number && <p id="pay-number-err" className="mt-1.5 text-sm text-danger">{errors.number}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pay-name" className="mb-1.5 block text-sm font-semibold">Name on card</label>
              <input
                id="pay-name" className="field" autoComplete="cc-name" value={card.name}
                onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
                aria-invalid={touched && !!errors.name} aria-describedby={touched && errors.name ? "pay-name-err" : undefined}
              />
              {touched && errors.name && <p id="pay-name-err" className="mt-1.5 text-sm text-danger">{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="pay-exp" className="mb-1.5 block text-sm font-semibold">Expiry</label>
              <input
                id="pay-exp" className="field" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp}
                onChange={(e) => setCard((c) => ({ ...c, exp: formatExp(e.target.value) }))}
                aria-invalid={touched && !!errors.exp} aria-describedby={touched && errors.exp ? "pay-exp-err" : undefined}
              />
              {touched && errors.exp && <p id="pay-exp-err" className="mt-1.5 text-sm text-danger">{errors.exp}</p>}
            </div>
            <div>
              <label htmlFor="pay-cvc" className="mb-1.5 block text-sm font-semibold">Security code</label>
              <input
                id="pay-cvc" className="field" inputMode="numeric" autoComplete="cc-csc" placeholder={brand === "Amex" ? "4 digits" : "3 digits"} value={card.cvc}
                onChange={(e) => setCard((c) => ({ ...c, cvc: digits(e.target.value).slice(0, cvcLen) }))}
                aria-invalid={touched && !!errors.cvc} aria-describedby={touched && errors.cvc ? "pay-cvc-err" : undefined}
              />
              {touched && errors.cvc && <p id="pay-cvc-err" className="mt-1.5 text-sm text-danger">{errors.cvc}</p>}
            </div>
          </div>
        )}

        {method === "upi" && (
          <div className="mt-4 space-y-2 rounded-2xl bg-sand-50 p-4">
            <div className="flex flex-wrap gap-2">
              {["Google Pay", "PhonePe", "Paytm UPI", "BHIM"].map((app) => (
                <button
                  key={app}
                  type="button"
                  onClick={() => setUpiId(app.toLowerCase().replace(/[^a-z]/g, "") + "@upi")}
                  className="rounded-lg border border-sand-300 bg-white px-2.5 py-1 text-xs font-semibold hover:border-pine-600 text-pine-700"
                >
                  ⚡ {app}
                </button>
              ))}
            </div>
            <input
              className="field text-sm mt-2"
              placeholder="Enter UPI VPA (e.g. mobile@upi)"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
            />
            <p className="text-xs text-ink-500">Zero surcharge. Authenticated securely via your UPI PIN.</p>
          </div>
        )}

        {method === "netbanking" && (
          <div className="mt-4 rounded-2xl bg-sand-50 p-4">
            <label htmlFor="modal-bank" className="block text-xs font-semibold text-ink-600 mb-1">Select Bank</label>
            <select
              id="modal-bank"
              className="field text-sm"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
            >
              {banks.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
        )}

        {payError && (
          <p role="alert" className="mt-3 rounded-xl bg-ember-50 p-3 text-sm text-ember-700">{payError}</p>
        )}
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Paying now doesn't change your cancellation terms — you can still cancel by {booking.freeCancelUntil ? fmtMed(booking.freeCancelUntil) : "the property's deadline"} if your rate allows it.
        </p>
      </div>
    </Modal>
  );
}

/* ───────── review dialog ───────── */

const SUB_LABELS = ["Cleanliness", "Location", "Service", "Comfort", "Value"];

function ReviewDialog({
  open, onClose, booking, author, onSaved,
}: { open: boolean; onClose: () => void; booking: Booking; author: string; onSaved: () => void }) {
  const editing = !!booking.review;
  const [score, setScore] = useState(9);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReviewError("");
    setScore(booking.review?.score ?? 9);
    setTitle(booking.review?.title ?? "");
    setText(booking.review?.text ?? "");
    setScores(
      booking.review?.scores ??
        Object.fromEntries(SUB_LABELS.map((l) => [l, 9])),
    );
    setTouched(false);
    setBusy(false);
  }, [open, booking.review]);

  const errors = {
    title: title.trim().length >= 3 ? "" : "Give your review a short headline.",
    text: text.trim().length >= 20 ? "" : "A sentence or two helps the next guest — at least 20 characters.",
  };

  const submit = async () => {
    setTouched(true);
    if (errors.title || errors.text) return;
    setBusy(true);
    try {
      await saveReview(booking.ref, {
        score,
        scores,
        title: title.trim(),
        text: text.trim(),
      });
      onSaved();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Review could not be posted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit your review" : "How was your stay?"}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500">Published under {author}</p>
          <button type="button" onClick={submit} disabled={busy} className={btnClass("primary", "md")}>
            {busy ? "Posting…" : editing ? "Save changes" : "Post review"}
          </button>
        </div>
      }
    >
      <div className="space-y-5 py-4">
        <div>
          <p className="text-sm font-semibold">Overall score</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="display text-3xl tabular-nums">{score.toFixed(1)}</span>
            <span className="text-sm font-medium text-ink-700">{ratingLabel(score)}</span>
          </div>
          <div className="mt-3 grid grid-cols-10 gap-1" role="radiogroup" aria-label="Overall score out of 10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={score === v}
                onClick={() => setScore(v)}
                className={cn(
                  "grid h-9 place-items-center rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                  score === v ? "border-pine-600 bg-pine-600 text-white" : "border-sand-300 bg-white text-ink-700 hover:border-ink",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-400"><span>Poor</span><span>Exceptional</span></div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Rate the details</legend>
          <div className="mt-2 space-y-2">
            {SUB_LABELS.map((l) => (
              <div key={l} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3">
                <label htmlFor={`sub-${l}`} className="text-sm">{l}</label>
                <input
                  id={`sub-${l}`} type="range" min={1} max={10} step={1} value={scores[l] ?? 9}
                  onChange={(e) => setScores((s) => ({ ...s, [l]: Number(e.target.value) }))}
                  className="h-1.5 w-full accent-pine-600"
                />
                <output htmlFor={`sub-${l}`} className="text-right text-sm font-semibold tabular-nums">{(scores[l] ?? 9).toFixed(1)}</output>
              </div>
            ))}
          </div>
        </fieldset>

        {reviewError && <p role="alert" className="rounded-xl bg-ember-50 p-3 text-sm text-ember-700">{reviewError}</p>}
        <div>
          <label htmlFor="rv-title" className="mb-1.5 block text-sm font-semibold">Headline</label>
          <input
            id="rv-title" className="field" maxLength={70} placeholder="Quiet, central, exactly as pictured"
            value={title} onChange={(e) => setTitle(e.target.value)}
            aria-invalid={touched && !!errors.title}
          />
          {touched && errors.title && <p className="mt-1.5 text-sm text-danger">{errors.title}</p>}
        </div>
        <div>
          <label htmlFor="rv-text" className="mb-1.5 block text-sm font-semibold">Your review</label>
          <textarea
            id="rv-text" className="field resize-y" rows={5} maxLength={1000} placeholder="What should the next guest know? The room, the staff, the breakfast, the walk into town…"
            value={text} onChange={(e) => setText(e.target.value)}
            aria-invalid={touched && !!errors.text}
          />
          <div className="mt-1.5 flex justify-between text-xs">
            <span className={cn("text-ink-500", touched && errors.text && "text-danger")}>{touched && errors.text ? errors.text : "Be specific and fair — the property can reply."}</span>
            <span className="tabular-nums text-ink-400">{text.length}/1000</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ───────── messages ───────── */

function Messages({
  booking, hostName, inject, onInjectUsed,
}: { booking: Booking; hostName: string; inject: string; onInjectUsed: () => void }) {
  const { threads } = useAccount();
  const thread = threadFor(threads, booking.ref);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    markThreadRead(booking.ref);
  }, [booking.ref, thread.messages.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [thread.messages.length, pending]);

  useEffect(() => {
    if (!inject) return;
    setText(inject);
    onInjectUsed();
    boxRef.current?.focus();
  }, [inject, onInjectUsed]);

  const send = async () => {
    if (!text.trim() || pending) return;
    setChatError("");
    try {
      await sendMessage(booking.ref, text);
      setText("");
      setPending(true);
      window.setTimeout(() => setPending(false), 2400);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Message could not be sent.");
    }
  };

  const quick = ["We'll be arriving late", "Could we have a cot?", "Is early check-in possible?", "Can you arrange a transfer?"];

  return (
    <section id="messages" aria-labelledby="messages-heading" className="scroll-mt-20 rounded-3xl border border-sand-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 p-5">
        <div>
          <h2 id="messages-heading" className="display text-2xl">Message the property</h2>
          <p className="text-sm text-ink-500">
            {hostName} · front desk · usually replies within the hour
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pine-50 px-2.5 py-1 text-xs font-semibold text-pine-700">
          <MessageSquare className="size-3.5" aria-hidden />
          Private thread
        </span>
      </div>

      <div ref={listRef} className="max-h-[24rem] space-y-4 overflow-y-auto p-5" aria-live="polite" aria-label="Conversation with the property">
        {thread.messages.length === 0 && (
          <p className="rounded-2xl bg-sand-50 p-4 text-sm text-ink-700">
            Nothing here yet. Ask about arrival times, the room, luggage, transfers — anything. The property replies in this thread.
          </p>
        )}
        {thread.messages.map((m) => {
          const mine = m.from === "guest";
          return (
            <div key={m.id} className={cn("flex gap-2.5", mine && "justify-end")}>
              {!mine && (
                <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-pine-100 text-xs font-bold text-pine-700" aria-hidden>
                  {hostName.charAt(0)}
                </span>
              )}
              <div className={cn("max-w-[85%] sm:max-w-[75%]", mine && "text-right")}>
                <div className={cn("rounded-2xl px-4 py-2.5 text-left text-[15px] leading-relaxed", mine ? "rounded-br-md bg-pine-600 text-white" : "rounded-bl-md bg-sand-50 text-ink")}>
                  {m.text}
                </div>
                <p className="mt-1 text-[11px] text-ink-400">
                  {mine ? "You" : hostName} · {stamp(m.at)}, {clock(m.at)}
                </p>
              </div>
            </div>
          );
        })}
        {pending && (
          <div className="flex items-center gap-2.5 text-sm text-ink-500">
            <span className="grid size-8 place-items-center rounded-full bg-pine-100 text-xs font-bold text-pine-700" aria-hidden>{hostName.charAt(0)}</span>
            <span className="inline-flex gap-1 rounded-2xl bg-sand-50 px-3.5 py-3" aria-label={`${hostName} is typing`}>
              {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-ink-400" style={{ animationDelay: `${i * 160}ms` }} />)}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-sand-200 p-5">
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => { setText(q); boxRef.current?.focus(); }} className="shrink-0 rounded-full border border-sand-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-ink">
              {q}
            </button>
          ))}
        </div>
        <label htmlFor="msg" className="sr-only">Message to the property</label>
        <textarea
          id="msg" ref={boxRef} rows={3} maxLength={1200}
          className="field resize-y"
          placeholder={`Ask ${hostName} anything about your stay…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {chatError && <p role="alert" className="mb-2 text-sm text-ember-700">{chatError}</p>}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">Enter to send · Shift + Enter for a new line. The property sees your name and dates, not your card.</p>
          <button type="button" onClick={send} disabled={!text.trim()} className={btnClass("dark", "md")}>
            <Send className="size-4" aria-hidden />
            Send message
          </button>
        </div>
      </div>
    </section>
  );
}

/* ───────── page ───────── */

function Detail({ booking, query }: { booking: Booking; query: URLSearchParams }) {
  const { user, threads } = useAccount();
  const hotel = getHotel(booking.hotelId)!;
  const city = getCity(hotel.cityId);
  const host = getHost(hotel.cityId);
  const status = statusOf(booking);
  const due = balanceDue(booking);
  const paid = Math.max(0, paidOf(booking));
  const unread = unreadFrom(threads, booking.ref);
  const nearby = useMemo(() => nearbyFor(hotel), [hotel]);

  const [payOpen, setPayOpen] = useState(query.get("pay") === "1" && due > 0);
  const [reviewOpen, setReviewOpen] = useState(query.get("review") === "1" && canReview(booking));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteReviewOpen, setDeleteReviewOpen] = useState(false);
  const [inject, setInject] = useState("");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (query.get("to") !== "messages") return;
    const t = window.setTimeout(() => document.getElementById("messages")?.scrollIntoView({ behavior: "smooth", block: "start" }), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const askChange = () => {
    setInject(`Could we update our special requests? ${booking.requests.length ? `We currently have: ${booking.requests.join(", ")}. ` : ""}We'd like to ask about `);
    document.getElementById("messages")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelNow = async () => {
    let result;
    try {
      result = await cancelBooking(booking.ref);
    } catch (err) {
      setCancelOpen(false);
      setToast(err instanceof Error ? err.message : "The booking could not be cancelled.");
      return;
    }
    setCancelOpen(false);
    setToast(
      result.refund > 0
        ? `Booking cancelled. ${money(result.refund)} will be refunded to ${booking.paymentMethod} within 5–10 business days.`
        : paid === 0
          ? "Booking cancelled. Nothing had been paid, so there's nothing to refund and nothing further to pay."
          : "Booking cancelled. Nothing was due back because this rate isn't refundable.",
    );
  };

  const freeCancel = booking.refundable && !!booking.freeCancelUntil && toISO(today()) <= booking.freeCancelUntil;
  const firstNight = Math.round(booking.roomTotal / Math.max(1, booking.nights));
  const estimatedRefund = Math.min(paid, freeCancel ? paid : Math.max(0, paid - firstNight));
  const days = nightsUntil(booking);

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(booking.ref);
    } catch {
      /* clipboard blocked */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Header sticky={false} />
      <main className="container-x pb-16 pt-6">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
          <Link to="/account" className="hover:text-ink hover:underline">Account</Link>
          <span aria-hidden>/</span>
          <Link to="/account?tab=trips" className="hover:text-ink hover:underline">My trips</Link>
          <span aria-hidden>/</span>
          <span className="font-mono text-ink" aria-current="page">{booking.ref}</span>
        </nav>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={status} />
              <span className="text-sm text-ink-500">{booking.rateName}</span>
            </div>
            <h1 className="display mt-2 text-[clamp(2.1rem,4.8vw,3.4rem)] leading-[1.03]">{hotel.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-500">
              <MapPin className="size-4" aria-hidden />
              {hotel.area}, {city.name}
              <span aria-hidden>·</span>
              {fmtMed(booking.checkIn)} – {fmtMed(booking.checkOut)}
              <span aria-hidden>·</span>
              {plural(booking.nights, "night")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => document.getElementById("messages")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={cn(btnClass("outline", "sm"), "relative")}
            >
              <MessageSquare className="size-4" aria-hidden />
              Message property
              {unread > 0 && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-ember-500 ring-2 ring-paper" aria-label="New reply" />}
            </button>
            <button type="button" onClick={() => window.print()} className={btnClass("outline", "sm")}>
              <Printer className="size-4" aria-hidden />
              Print
            </button>
          </div>
        </div>

        <div className="mt-7 grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-5">
            {/* stay */}
            <section aria-labelledby="stay-heading" className="overflow-hidden rounded-3xl border border-sand-200 bg-white">
              <div className="relative h-40 sm:h-48">
                <Img id={hotel.images[0].id} w={1100} h={420} alt={`${hotel.name}, ${city.name}`} className="size-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/55 to-transparent" aria-hidden />
                <div className="absolute inset-x-4 bottom-3 flex flex-wrap items-end justify-between gap-3 text-white">
                  <div>
                    <p className="flex items-center gap-2 text-sm"><Stars n={hotel.stars} /> <span className="opacity-80">{hotel.type}</span></p>
                    <p className="mt-0.5 text-sm text-white/80">{nearby[0] ? `${nearby[0].name} is a ${nearby[0].time} away` : city.centre}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm backdrop-blur">
                    <ShieldCheck className="size-4" aria-hidden />
                    Booking {booking.ref}
                    <button type="button" onClick={copyRef} aria-label="Copy booking reference" className="text-white/80 hover:text-white">
                      {copied ? <CheckIcon className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    </button>
                  </span>
                </div>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="stay-heading" className="display text-2xl">Your stay</h2>
                  <Link to={`/hotel/${hotel.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-pine-600 hover:underline">
                    View the property
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-500">Check-in</dt>
                    <dd className="font-semibold">{fmtLong(booking.checkIn)}</dd>
                    <dd className="text-sm text-ink-500">from {hotel.checkInTime}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Check-out</dt>
                    <dd className="font-semibold">{fmtLong(booking.checkOut)}</dd>
                    <dd className="text-sm text-ink-500">until {hotel.checkOutTime}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Room & rate</dt>
                    <dd className="flex items-center gap-1.5 font-semibold"><BedDouble className="size-4 text-ink-400" aria-hidden /> {booking.roomName}{booking.rooms > 1 && ` × ${booking.rooms}`}</dd>
                    <dd className="text-sm text-ink-500">{booking.rateName} · {booking.refundable ? "refundable" : "non-refundable"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-500">Guests</dt>
                    <dd className="flex items-center gap-1.5 font-semibold"><Users className="size-4 text-ink-400" aria-hidden /> {plural(booking.adults + booking.children, "guest")}</dd>
                    <dd className="text-sm text-ink-500">
                      {booking.adults} adult{booking.adults === 1 ? "" : "s"}{booking.children ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""} · {booking.firstName} {booking.lastName}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => calendarFor(booking, hotel.name, hotel.area, city.name)} className={btnClass("outline", "sm")}>
                    <CalendarPlus className="size-4" aria-hidden />
                    Add to calendar
                  </button>
                  <a href={`https://www.openstreetmap.org/?mlat=${hotel.lat}&mlon=${hotel.lng}#map=16/${hotel.lat}/${hotel.lng}`} target="_blank" rel="noreferrer" className={btnClass("outline", "sm")}>
                    <Navigation className="size-4" aria-hidden />
                    Directions
                  </a>
                  {status === "completed" && (
                    <Link to={`/hotel/${hotel.id}?${new URLSearchParams({ in: booking.checkIn, out: booking.checkOut, a: String(booking.adults), c: String(booking.children), r: String(booking.rooms), dest: hotel.cityId })}`} className={btnClass("outline", "sm")}>
                      Book this stay again
                    </Link>
                  )}
                </div>
              </div>
            </section>

            {/* payment */}
            <section aria-labelledby="payment-heading" className="rounded-3xl border border-sand-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="payment-heading" className="display flex items-center gap-2 text-2xl"><Wallet className="size-5 text-pine-600" aria-hidden /> Payment</h2>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", booking.cancelledAt ? "bg-sand-100 text-ink-500" : due > 0 ? "bg-ember-50 text-ember-700" : "bg-pine-50 text-pine-700")}>
                  {booking.cancelledAt ? "Cancelled" : due > 0 ? "Balance due" : "Paid in full"}
                </span>
              </div>

              {booking.cancelledAt ? (
                <div className="mt-4 rounded-2xl bg-sand-50 p-4">
                  <p className="font-semibold">Cancelled {stamp(booking.cancelledAt)}</p>
                  <p className="mt-1 text-sm text-ink-700">
                    {booking.refundAmount > 0
                      ? `${money(booking.refundAmount)} was refunded to ${booking.paymentMethod}. It usually appears within 5–10 business days.`
                      : paidOf(booking) === 0
                        ? "Nothing had been paid, so there's nothing to refund. Nothing further will be charged."
                        : "No refund was due on this rate. Nothing further will be charged."}
                  </p>
                </div>
              ) : due > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ember-50/70 p-4">
                  <div>
                    <p className="text-sm font-semibold text-ember-700">{money(due)} still to pay</p>
                    <p className="text-sm text-ink-700">
                      Due by {fmtMed(booking.checkIn)}. Pay now online, or settle at reception on arrival.
                    </p>
                  </div>
                  <button type="button" onClick={() => setPayOpen(true)} className={btnClass("primary", "md")}>
                    <CreditCard className="size-4" aria-hidden />
                    Pay {money(due)} now
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pine-50 p-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-pine-700">
                      <CheckIcon className="size-4" aria-hidden /> {money(paid)} paid in full
                    </p>
                    <p className="text-sm text-ink-700">
                      {booking.paymentMethod}
                      {booking.payments.length > 0 && ` · ${stamp(booking.payments.filter((p) => p.kind === "payment").at(-1)?.at ?? booking.createdAt)}`}
                    </p>
                  </div>
                  <Receipt className="size-5 text-pine-600" aria-hidden />
                </div>
              )}

              <dl className="mt-5 space-y-2.5 text-[15px] tabular-nums">
                <div className="flex justify-between gap-4">
                  <dt>{money(booking.roomTotal / Math.max(1, booking.nights))} × {plural(booking.nights, "night")}{booking.rooms > 1 && ` × ${booking.rooms} rooms`}</dt>
                  <dd>{money(booking.roomTotal)}</dd>
                </div>
                {booking.addons.map((a) => (
                  <div key={a.id} className="flex justify-between gap-4"><dt>{a.title}</dt><dd>{money(a.amount)}</dd></div>
                ))}
                {booking.discount > 0 && (
                  <div className="flex justify-between gap-4 font-semibold text-pine-600">
                    <dt>Coupon {booking.coupon}</dt><dd>−{money(booking.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 text-ink-500"><dt>Taxes &amp; fees</dt><dd>Included ({money(booking.taxes)})</dd></div>
                <div className="flex justify-between gap-4 text-ink-500"><dt>Booking fee</dt><dd>$0</dd></div>
                <div className="flex justify-between gap-4 border-t border-ink pt-2.5 text-base font-bold"><dt>Total</dt><dd>{money(booking.total)}</dd></div>
              </dl>

              {booking.payments.length > 0 && (
                <details className="mt-4 rounded-2xl border border-sand-200">
                  <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
                    Payment history
                    <span className="text-ink-500">{plural(booking.payments.length, "entry")}</span>
                  </summary>
                  <ul className="divide-y divide-sand-200 border-t border-sand-200 text-sm">
                    {booking.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                        <span>
                          <span className="block font-medium">{p.kind === "refund" ? "Refund" : "Payment"} · {p.method}</span>
                          <span className="text-xs text-ink-500">{stamp(p.at)}</span>
                        </span>
                        <span className={cn("font-semibold tabular-nums", p.kind === "refund" ? "text-pine-600" : "")}>
                          {p.kind === "refund" ? "−" : ""}{money(p.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            {/* special requests */}
            <section aria-labelledby="requests-heading" className="rounded-3xl border border-sand-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="requests-heading" className="display flex items-center gap-2 text-2xl"><Receipt className="size-5 text-pine-600" aria-hidden /> Special requests</h2>
                {!booking.cancelledAt && (
                  <button type="button" onClick={askChange} className={cn(btnClass("outline", "sm"), "gap-1.5")}>
                    <Pencil className="size-3.5" aria-hidden />
                    Ask for a change
                  </button>
                )}
              </div>
              {booking.requests.length === 0 && !booking.notes && !booking.arrival ? (
                <p className="mt-3 text-sm text-ink-500">None made. You can still message the property to ask for anything.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {booking.requests.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {booking.requests.map((r) => (
                        <li key={r} className="rounded-full bg-pine-50 px-3 py-1.5 text-sm font-medium text-pine-700">{r}</li>
                      ))}
                    </ul>
                  )}
                  {booking.notes && (
                    <div className="rounded-2xl bg-sand-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Your note</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-ink-700">“{booking.notes}”</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <p className="flex items-center gap-1.5"><Clock className="size-4 text-ink-400" aria-hidden /> Arrival: <span className="font-medium">{booking.arrival || "Not specified"}</span></p>
                    <p className="text-ink-500">Requests are passed to the property but can't be guaranteed.</p>
                  </div>
                </div>
              )}
            </section>

            <Messages booking={booking} hostName={host.name} inject={inject} onInjectUsed={() => setInject("")} />

            {/* review */}
            <section aria-labelledby="review-heading" className="rounded-3xl border border-sand-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="review-heading" className="display flex items-center gap-2 text-2xl"><Star className="size-5 text-gold" aria-hidden /> Your review</h2>
                {booking.review && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setReviewOpen(true)} className={btnClass("outline", "sm")}><Pencil className="size-3.5" aria-hidden /> Edit</button>
                    <button type="button" onClick={() => setDeleteReviewOpen(true)} className={btnClass("ghost", "sm", "text-danger")}><Trash2 className="size-3.5" aria-hidden /> Delete</button>
                  </div>
                )}
              </div>

              {booking.review ? (
                <div className="mt-4">
                  <div className="flex items-start gap-4">
                    <ScoreChip rating={booking.review.score} className="h-12 min-w-12 text-lg" />
                    <div className="min-w-0">
                      <p className="display text-xl leading-snug">“{booking.review.title}”</p>
                      <p className="mt-0.5 text-sm text-ink-500">
                        Posted {stamp(booking.review.at)} · {ratingLabel(booking.review.score)} · visible on the property page
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-700">{booking.review.text}</p>
                  <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                    {Object.entries(booking.review.scores).map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-sm">
                        <dt>{label}</dt>
                        <dd className="h-1.5 overflow-hidden rounded-full bg-sand-200" aria-hidden>
                          <span className="block h-full rounded-full bg-pine-600" style={{ width: `${value * 10}%` }} />
                        </dd>
                        <dd className="text-right font-semibold tabular-nums">{value.toFixed(1)}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link to={`/hotel/${hotel.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-pine-600 hover:underline">
                    See it on {hotel.name}
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </div>
              ) : status === "completed" ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-sand-50 p-4">
                  <p className="max-w-md text-sm text-ink-700">
                    You checked out on {fmtMed(booking.checkOut)}. A few honest lines help the next guest — and the property can reply.
                  </p>
                  <button type="button" onClick={() => setReviewOpen(true)} className={btnClass("dark", "md")}>
                    <Star className="size-4" aria-hidden />
                    Write a review
                  </button>
                </div>
              ) : booking.cancelledAt ? (
                <p className="mt-3 text-sm text-ink-500">Cancelled stays can't be reviewed.</p>
              ) : (
                <p className="mt-3 text-sm text-ink-500">
                  Reviews open the day after check-out. {days > 0 ? `That's in ${plural(days + booking.nights, "day")}.` : "You'll get an email when it's time."}
                </p>
              )}
            </section>

            {/* cancellation */}
            <section aria-labelledby="cancel-heading" className="rounded-3xl border border-sand-200 bg-white p-5">
              <h2 id="cancel-heading" className="display text-2xl">Cancellation</h2>
              {booking.cancelledAt ? (
                <p className="mt-2 text-sm text-ink-700">This trip was cancelled on {stamp(booking.cancelledAt)}. {booking.refundAmount > 0 ? `${money(booking.refundAmount)} refunded.` : "No refund was due."}</p>
              ) : (
                <>
                  <p className="mt-2 flex items-start gap-2 text-[15px] leading-relaxed">
                    {booking.refundable ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-pine-600" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />}
                    <span>
                      {booking.refundable ? (
                        <>
                          <span className="font-semibold">Free to cancel until 6 pm on {booking.freeCancelUntil ? fmtLong(booking.freeCancelUntil) : "two days before arrival"}.</span> After that, the first night is charged.
                        </>
                      ) : (
                        <span className="font-semibold">This rate is non-refundable</span>
                      )}
                      {" "}Cancelling before then refunds {money(paid)} to your original payment method.
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-ink-500">Need to move dates instead? Message {host.name} — changes are often possible, but never guaranteed.</p>
                  <button type="button" onClick={() => setCancelOpen(true)} className={btnClass("outline", "sm", "mt-4 text-danger hover:border-danger")}>
                    Cancel this booking
                  </button>
                </>
              )}
            </section>
          </div>

          {/* property sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-3xl border border-sand-200 bg-white">
              <Img id={hotel.images[0].id} w={700} h={380} alt={hotel.name} className="h-36 w-full" />
              <div className="p-5">
                <p className="eyebrow text-ink-500">You're staying at</p>
                <p className="display mt-1 text-xl leading-tight">{hotel.name}</p>
                <p className="mt-1 text-sm text-ink-500">{hotel.area}, {city.name}</p>
                <div className="mt-3 flex items-center gap-2">
                  <ScoreChip rating={hotel.rating} className="h-7 min-w-8 text-xs" />
                  <span className="text-sm">{ratingLabel(hotel.rating)}</span>
                </div>
                <ul className="mt-4 space-y-2.5 border-t border-sand-200 pt-4 text-sm">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sand-100"><Phone className="size-3.5" aria-hidden /></span>
                    <span>
                      <span className="block font-semibold">{host.name} · {host.role}</span>
                      <a href={`tel:${(host.phone ?? "+91 22 4100 8800").replace(/\s+/g, "")}`} className="text-pine-600 hover:underline">{host.phone ?? "+91 22 4100 8800"}</a>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sand-100"><Mail className="size-3.5" aria-hidden /></span>
                    <span>
                      <span className="block font-semibold">Email</span>
                      <a href={`mailto:frontdesk@${hotel.id}.example`} className="break-all text-pine-600 hover:underline">frontdesk@{hotel.id}.example</a>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sand-100"><Clock className="size-3.5" aria-hidden /></span>
                    <span>
                      <span className="block font-semibold">Reception</span>
                      24 hours · check-in from {hotel.checkInTime}
                    </span>
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => document.getElementById("messages")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={btnClass("primary", "md", "mt-4 w-full")}
                >
                  <MessageSquare className="size-4" aria-hidden />
                  Chat with {host.name}
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-pine-800 p-5 text-white">
              <p className="font-semibold">Laorvia guest support</p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">
                For anything the property can't solve — a wrong charge, a booking you can't see, a refund that hasn't arrived.
              </p>
              <Link to="/" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-4">
                Contact support
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </aside>
        </div>

        <div className="mt-8">
          <Link to="/account?tab=trips" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden />
            All my trips
          </Link>
        </div>
      </main>

      <PayDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        booking={booking}
        onPaid={(amount, label) => {
          setPayOpen(false);
          setToast(`${money(amount)} paid with ${label}. Your booking is settled — nothing left to pay at check-in.`);
        }}
      />

      <ReviewDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        booking={booking}
        author={`${user?.firstName ?? "Guest"} ${user?.lastName?.charAt(0) ?? ""}.`}
        onSaved={() => {
          setReviewOpen(false);
          setToast("Thank you — your review is live and appears on the property page.");
        }}
      />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setCancelOpen(false)} className={btnClass("outline", "md")}>Keep my booking</button>
            <button type="button" onClick={cancelNow} className={btnClass("dark", "md", "bg-danger hover:bg-danger/90")}>Cancel booking</button>
          </div>
        }
      >
        <div className="space-y-3 py-3 text-[15px] leading-relaxed text-ink-700">
          <p>
            {paid === 0
              ? "Nothing has been paid on this booking yet, so cancelling is free and there's nothing to refund."
              : freeCancel
              ? `You're inside the free cancellation window, so ${money(estimatedRefund)} comes back to ${booking.paymentMethod}.`
              : booking.refundable
                ? `The free cancellation deadline has passed. We'd keep the first night (${money(firstNight)}) and refund ${money(estimatedRefund)}.`
                : "This rate is non-refundable, so no money comes back. You're still welcome to message the property to ask about a gesture."}
          </p>
          <p className="rounded-xl bg-sand-50 p-3 text-sm">
            <strong>Room:</strong> {booking.roomName} · {plural(booking.nights, "night")} from {fmtMed(booking.checkIn)}
          </p>
          <p className="text-sm text-ink-500">This can't be undone. You'd need to book again, and prices may have changed.</p>
        </div>
      </Modal>

      <Modal
        open={deleteReviewOpen}
        onClose={() => setDeleteReviewOpen(false)}
        title="Delete your review?"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteReviewOpen(false)} className={btnClass("outline", "md")}>Keep it</button>
            <button
              type="button"
              className={btnClass("dark", "md", "bg-danger hover:bg-danger/90")}
              onClick={async () => {
                await removeReview(booking.ref);
                setDeleteReviewOpen(false);
                setToast("Review deleted from Redis. You can write a new one any time.");
              }}
            >
              Delete review
            </button>
          </div>
        }
      >
        <p className="py-3 text-[15px] text-ink-700">It disappears from the property page straight away. Your booking keeps its dates and payment history.</p>
      </Modal>

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-5 z-[70] mx-auto flex max-w-md animate-rise items-start gap-3 rounded-2xl bg-ink p-4 text-sm text-white shadow-pop">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-pine-200" aria-hidden />
          <p className="flex-1">{toast}</p>
          <button type="button" onClick={() => setToast("")} aria-label="Dismiss" className="text-white/60 hover:text-white">×</button>
        </div>
      )}
      <Footer />
    </>
  );
}

export default function AccountBooking({ ref: refId, query }: { ref: string | undefined; query: URLSearchParams }) {
  const { user, bookings } = useAccount();
  const booking = bookings.find((b) => b.ref === refId && b.userId === user?.id) ?? null;

  if (!booking) {
    return (
      <>
        <Header />
        <main className="container-x py-24 text-center">
          <p className="eyebrow text-pine-600">Booking</p>
          <h1 className="display mx-auto mt-3 max-w-xl text-4xl leading-tight">We can't find that trip</h1>
          <p className="mx-auto mt-3 max-w-md text-ink-500">
            It may belong to another account or have been removed. Your other trips are waiting in your account.
          </p>
          <Link to="/account?tab=trips" className={btnClass("primary", "md", "mt-6")}>Go to my trips</Link>
        </main>
        <Footer />
      </>
    );
  }

  return <Detail key={booking.ref} booking={booking} query={query} />;
}
