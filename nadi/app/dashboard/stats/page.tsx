import type { Metadata } from "next";
import Link from "next/link";
import { getStaffContext } from "@/lib/staff";
import { getServerSupabase } from "@/lib/supabase/server";
import { locale, t } from "@/lib/i18n";
import { buildStats, hourlyFromOrders, type HourlyStat, type LiveOrder } from "@/lib/stats";
import styles from "./stats.module.css";

export const metadata: Metadata = { title: { absolute: "Nadi" } };

const RANGES = [7, 30, 90];

const since = (days: number) => new Date(Date.now() - (days + 1) * 86400_000).toISOString();

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { restaurant } = await getStaffContext();
  const d = t(restaurant.language);
  const loc = locale(restaurant.language);
  const tz = restaurant.timezone ?? "Africa/Casablanca";
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 7;

  const supabase = await getServerSupabase();
  const [{ data: hourly }, { data: live }] = await Promise.all([
    supabase
      .from("order_stats_hourly")
      .select("hour, orders, prep_samples, prep_seconds")
      .eq("restaurant_id", restaurant.id)
      .gte("hour", since(days)),
    // Orders not yet folded into order_stats_hourly (the last ~24 hours).
    supabase.from("orders").select("created_at, ready_at").eq("restaurant_id", restaurant.id),
  ]);
  const stats = buildStats(
    [...((hourly ?? []) as HourlyStat[]), ...hourlyFromOrders((live ?? []) as LiveOrder[])],
    tz,
    days,
  );

  const minutes = (secs: number | null) => (secs == null ? "—" : d.statsMinutes.replace("{min}", String(Math.round(secs / 60))));
  const dayLabel = (day: string) =>
    new Intl.DateTimeFormat(loc, days > 7 ? { day: "numeric", month: "short", timeZone: "UTC" } : { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${day}T12:00:00Z`),
    );
  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}h`;
  const maxDay = Math.max(1, ...stats.days.map((x) => x.orders));
  const maxHour = Math.max(1, ...stats.hours);
  const busiest = stats.hours.indexOf(Math.max(...stats.hours));
  // Show the restaurant's opening hours, not 24 mostly empty bars.
  const firstHour = stats.hours.findIndex((n) => n > 0);
  const lastHour = 23 - [...stats.hours].reverse().findIndex((n) => n > 0);
  const hourRange = firstHour < 0 ? [] : Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);

  return (
    <main className={styles.main}>
      <div className={styles.head}>
        <h1 className={styles.title}>{d.stats}</h1>
        <div className={styles.ranges}>
          {RANGES.map((n) => (
            <Link key={n} href={`/dashboard/stats?days=${n}`} className={`btn ${n === days ? "" : "btn-ghost"}`} aria-current={n === days ? "page" : undefined}>
              {d.statsRange.replace("{n}", String(n))}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{d.statsOrders}</span>
          <span className={styles.kpiValue}>{stats.total.toLocaleString(loc)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{d.statsAvgPrep}</span>
          <span className={styles.kpiValue}>{minutes(stats.avgPrepSeconds)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{d.statsPeakHours}</span>
          <span className={styles.kpiValue}>{firstHour < 0 ? "—" : `${hourLabel(busiest)}–${hourLabel((busiest + 1) % 24)}`}</span>
        </div>
      </div>

      {stats.total === 0 ? (
        <p className={styles.empty}>{d.statsNoData}</p>
      ) : (
        <>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{d.statsPerDay}</h2>
            <div className={styles.dayList}>
              {stats.days.map((x) => (
                <div key={x.day} className={styles.dayRow}>
                  <span className={styles.dayName}>{dayLabel(x.day)}</span>
                  <span className={styles.track}>
                    <span className={styles.bar} style={{ inlineSize: `${(x.orders / maxDay) * 100}%` }} />
                  </span>
                  <span className={styles.dayValue}>{x.orders}</span>
                  <span className={styles.dayPrep}>{x.orders ? minutes(x.avgPrepSeconds) : ""}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{d.statsPeakHours}</h2>
            <p className={styles.muted}>{d.statsBusiest.replace("{h}", `${hourLabel(busiest)}–${hourLabel((busiest + 1) % 24)}`)}</p>
            <div className={styles.hours} dir="ltr">
              {hourRange.map((h) => (
                <div key={h} className={styles.hourCol} title={`${hourLabel(h)} · ${stats.hours[h]}`}>
                  <span className={styles.hourCount}>{stats.hours[h] || ""}</span>
                  <span className={styles.hourTrack}>
                    <span
                      className={`${styles.hourBar} ${h === busiest ? styles.peak : ""}`}
                      style={{ blockSize: `${(stats.hours[h] / maxHour) * 100}%` }}
                    />
                  </span>
                  <span className={styles.hourLabel}>{hourLabel(h)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
