import { dayIn } from "./numbering";

/** One hour of history: a row of order_stats_hourly, or built from live orders. */
export interface HourlyStat {
  hour: string;
  orders: number;
  prep_samples: number;
  prep_seconds: number;
}

export interface LiveOrder {
  created_at: string;
  ready_at: string | null;
}

export interface Stats {
  total: number;
  avgPrepSeconds: number | null;
  /** Oldest first, one entry per calendar day of the range (restaurant time zone). */
  days: { day: string; orders: number; avgPrepSeconds: number | null }[];
  /** Orders by hour of day 0–23 over the range (restaurant time zone). */
  hours: number[];
}

const MAX_PREP_SECONDS = 3 * 3600; // same cut-off as cleanup_old_orders()

function hourIn(timezone: string, date: string): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date(date));
    return parseInt(h, 10) % 24;
  } catch {
    return new Date(date).getUTCHours();
  }
}

/** Live orders folded into hourly rows the same way the cleanup job does it. */
export function hourlyFromOrders(orders: LiveOrder[]): HourlyStat[] {
  const byHour = new Map<string, HourlyStat>();
  for (const o of orders) {
    const start = new Date(o.created_at);
    start.setUTCMinutes(0, 0, 0);
    const key = start.toISOString();
    const row = byHour.get(key) ?? { hour: key, orders: 0, prep_samples: 0, prep_seconds: 0 };
    row.orders++;
    if (o.ready_at) {
      const secs = (new Date(o.ready_at).getTime() - new Date(o.created_at).getTime()) / 1000;
      if (secs > 0 && secs < MAX_PREP_SECONDS) {
        row.prep_samples++;
        row.prep_seconds += secs;
      }
    }
    byHour.set(key, row);
  }
  return [...byHour.values()];
}

export function buildStats(rows: HourlyStat[], timezone: string, rangeDays: number, now = new Date()): Stats {
  const days: Stats["days"] = [];
  const dayIndex = new Map<string, number>();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const day = dayIn(timezone, new Date(now.getTime() - i * 86400_000));
    if (dayIndex.has(day)) continue; // DST edge: two instants on the same day
    dayIndex.set(day, days.length);
    days.push({ day, orders: 0, avgPrepSeconds: null });
  }
  const daySamples = days.map(() => ({ n: 0, secs: 0 }));
  const hours = Array<number>(24).fill(0);
  let total = 0;
  let samples = 0;
  let secs = 0;

  for (const r of rows) {
    const i = dayIndex.get(dayIn(timezone, r.hour));
    if (i === undefined) continue;
    days[i].orders += r.orders;
    daySamples[i].n += r.prep_samples;
    daySamples[i].secs += Number(r.prep_seconds);
    hours[hourIn(timezone, r.hour)] += r.orders;
    total += r.orders;
    samples += r.prep_samples;
    secs += Number(r.prep_seconds);
  }
  days.forEach((d, i) => {
    if (daySamples[i].n > 0) d.avgPrepSeconds = daySamples[i].secs / daySamples[i].n;
  });
  return { total, avgPrepSeconds: samples > 0 ? secs / samples : null, days, hours };
}
