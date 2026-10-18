import type { Order, Restaurant } from "./types";

type NumberingSettings = Pick<Restaurant, "number_prefix" | "number_digits" | "daily_reset" | "timezone">;

/** Calendar day (YYYY-MM-DD) of an instant in the restaurant's time zone. */
export function dayIn(timezone: string, date: Date | string = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(date),
    );
  } catch {
    return new Date(date).toISOString().slice(0, 10); // unknown time zone: fall back to UTC
  }
}

export function formatNumber(n: number, s: Pick<NumberingSettings, "number_prefix" | "number_digits">): string {
  return `${s.number_prefix}${String(n).padStart(s.number_digits, "0")}`;
}

/**
 * Suggested next order number: one more than the highest number using the
 * current prefix, counting only today's orders when the daily reset is on.
 */
export function nextNumber(orders: Order[], s: NumberingSettings): string {
  const today = dayIn(s.timezone);
  const prefix = s.number_prefix.toLowerCase();
  let max = 0;
  for (const o of orders) {
    if (s.daily_reset && dayIn(s.timezone, o.created_at) !== today) continue;
    const num = o.number.toLowerCase();
    if (!num.startsWith(prefix)) continue;
    const rest = num.slice(prefix.length);
    if (!/^\d+$/.test(rest)) continue;
    max = Math.max(max, parseInt(rest, 10));
  }
  return formatNumber(max + 1, s);
}
