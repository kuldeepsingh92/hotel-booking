/* Card input helpers shared by checkout and the "pay balance" flow. */

export const digits = (s: string) => s.replace(/\D/g, "");

export function cardBrand(n: string) {
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(6011|65)/.test(n)) return "Discover";
  return null;
}

export function formatCard(raw: string) {
  const n = digits(raw);
  if (/^3[47]/.test(n)) {
    const m = n.slice(0, 15);
    return [m.slice(0, 4), m.slice(4, 10), m.slice(10)].filter(Boolean).join(" ");
  }
  return n.slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function luhn(n: string) {
  if (n.length < 13) return false;
  let sum = 0;
  let alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function formatExp(raw: string) {
  let n = digits(raw).slice(0, 4);
  if (n.length === 1 && Number(n) > 1) n = "0" + n;
  return n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
}

export function expiryError(v: string) {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return "Enter the expiry date as MM/YY.";
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return "The month should be between 01 and 12.";
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return "This card has expired. Try a different card.";
  }
  return "";
}

export const methodLabel = (m: string) => m;
