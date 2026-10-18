"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { dir, locale, t } from "@/lib/i18n";
import { previewSound, unlockAudio } from "@/lib/sound";
import type { Lang } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import styles from "./screen.module.css";

export type ScreenRow = { number: string; status: "preparing" | "ready"; since: string };

/** How long a newly ready number stays highlighted. */
const NEW_FOR_MS = 15_000;

export function ScreenBoard({
  restaurant,
  lang,
  initialRows,
}: {
  restaurant: { id: string; name: string; logo_url: string | null };
  lang: Lang;
  initialRows: ScreenRow[];
}) {
  const d = t(lang);
  const [rows, setRows] = useState(initialRows);
  const [started, setStarted] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [clock, setClock] = useState("");
  const known = useRef(new Set(initialRows.filter((r) => r.status === "ready").map((r) => r.number)));
  const soundOn = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await getBrowserSupabase().rpc("screen_orders", { p_restaurant_id: restaurant.id });
    if (error || !data) return;
    const next = data as ScreenRow[];
    const newlyReady = next.filter((r) => r.status === "ready" && !known.current.has(r.number)).map((r) => r.number);
    known.current = new Set(next.filter((r) => r.status === "ready").map((r) => r.number));
    setRows(next);
    if (newlyReady.length) {
      if (soundOn.current) previewSound("chime");
      setFresh((f) => new Set([...f, ...newlyReady]));
      setTimeout(() => setFresh((f) => new Set([...f].filter((n) => !newlyReady.includes(n)))), NEW_FOR_MS);
    }
  }, [restaurant.id]);

  // Live: an empty ping on screen:<id> for every change, plus polling as a safety net.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`screen:${restaurant.id}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => void load())
        .subscribe((status) => status === "SUBSCRIBED" && void load());
    })();
    const poll = setInterval(() => void load(), 15_000);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [restaurant.id, load]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit" }));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [lang]);

  // One tap: allow the chime (autoplay rules), go full screen, keep the screen on.
  const start = () => {
    unlockAudio();
    soundOn.current = true;
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
    void navigator.wakeLock?.request("screen").catch(() => {});
  };

  const ready = rows.filter((r) => r.status === "ready").sort((a, b) => b.since.localeCompare(a.since));
  const preparing = rows.filter((r) => r.status === "preparing");

  return (
    <main dir={dir(lang)} lang={lang} className={styles.screen} onClick={started ? undefined : start}>
      <header className={styles.header}>
        <div className={styles.brand}>
          {restaurant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logo_url} alt="" className={styles.logo} />
          ) : (
            <BrandMark size={44} color="var(--brand)" />
          )}
          <span>{restaurant.name}</span>
        </div>
        <span className={styles.clock}>{clock}</span>
      </header>

      <section className={styles.ready} aria-live="polite">
        <h1 className={styles.readyTitle}>{d.screenReadyTitle}</h1>
        <div className={styles.readyGrid}>
          {ready.map((r) => (
            <span key={r.number} className={`${styles.readyNum} ${fresh.has(r.number) ? styles.fresh : ""}`} dir="ltr">
              {r.number}
            </span>
          ))}
          {!ready.length && <span className={styles.none}>—</span>}
        </div>
      </section>

      <section className={styles.preparing}>
        <h2 className={styles.prepTitle}>{d.screenPreparingTitle}</h2>
        <div className={styles.prepGrid}>
          {preparing.map((r) => (
            <span key={r.number} className={styles.prepNum} dir="ltr">
              {r.number}
            </span>
          ))}
          {!preparing.length && !ready.length && <span className={styles.none}>{d.screenNone}</span>}
        </div>
      </section>

      {!started && <p className={styles.start}>{d.screenStart}</p>}
    </main>
  );
}
