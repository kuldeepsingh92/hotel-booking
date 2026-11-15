const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("en-IN");

/** Formats an amount into Indian Rupees (e.g. ₹4,200 or ₹1,25,000) */
export const money = (n: number) => INR.format(Math.round(n));
export const num = (n: number) => NUM.format(n);
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Pexels CDN URL, cropped to the requested size. */
export const px = (id: number, w: number, h?: number) => {
  const base = `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}`;
  return h ? `${base}&h=${h}` : base;
};
