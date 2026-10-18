"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { dir, isLang, t } from "@/lib/i18n";
import { isAudioUnlocked, startAlarm, stopAlarm, subscribeAudio, unlockAudio } from "@/lib/sound";
import type { Lang, PublicOrder } from "@/lib/types";
import {
  getPushSubscription,
  iosVersion,
  isIos,
  isStandalone,
  linkOrderToPush,
  pushSupported,
  rememberOrder,
} from "@/lib/pushClient";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";
import styles from "./customer.module.css";

type AlertState = "idle" | "enabling" | "on";
type PushState = "unknown" | "unsupported" | "granted" | "denied" | "error";

type IosMode = "none" | "safari" | "safari-old" | "installed";

export function CustomerOrder({ initial, vapidPublicKey }: { initial: PublicOrder; vapidPublicKey: string }) {
  const [order, setOrder] = useState(initial);
  const [lang, setLang] = useState<Lang>(initial.language);
  const [alertState, setAlertState] = useState<AlertState>("idle");
  const [pushState, setPushState] = useState<PushState>("unknown");
  // "Stop sound" applies to one ready event: re-readied orders have a new ready_at and ring again.
  const [mutedFor, setMutedFor] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [iosMode, setIosMode] = useState<IosMode>("none");
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const alertOn = alertState === "on";
  const d = t(lang);

  // ---- Language (restaurant default, remembered per device) ----
  /* eslint-disable react-hooks/set-state-in-effect -- browser-only values (localStorage, user agent) can only be read after hydration */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nadi:lang");
      if (isLang(saved)) setLang(saved);
    } catch {}
    // iPhone only delivers web push to apps added to the Home Screen (iOS 16.4+).
    if (isIos()) {
      if (isStandalone()) setIosMode("installed");
      else setIosMode(iosVersion() >= 16.04 ? "safari" : "safari-old");
    }
    // Inside the installed app, keep this order in "my orders" (/c) and, if
    // notifications were already allowed, link it to push right away.
    if (isStandalone()) {
      rememberOrder(initial.id);
      if (pushSupported(vapidPublicKey) && Notification.permission === "granted") {
        getPushSubscription(vapidPublicKey)
          .then((sub) => linkOrderToPush(initial.id, sub))
          .then((ok) => ok && setPushState("granted"))
          .catch(() => {});
      }
    }
  }, [initial.id, vapidPublicKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir(lang);
  }, [lang]);

  const switchLang = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem("nadi:lang", next);
    } catch {}
  };

  // ---- Data: Realtime broadcast + polling fallback ----
  const refetch = useCallback(async () => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.rpc("get_public_order", { p_order_id: initial.id });
    if (!error && data?.[0]) setOrder(data[0] as PublicOrder);
  }, [initial.id]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`order:${initial.id}`, { config: { private: true } })
        .on("broadcast", { event: "order_update" }, ({ payload }) => {
          setOrder((o) => ({ ...o, status: payload.status, ready_at: payload.ready_at, number: payload.number }));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConnected(true);
            void refetch(); // catch anything that changed while connecting
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConnected(false);
          }
        });
    })();

    // Safety net: Realtime can silently drop on mobile networks / sleeping tabs.
    const poll = setInterval(() => void refetch(), 15_000);
    const onVisible = () => document.visibilityState === "visible" && void refetch();
    const onSwMessage = (e: MessageEvent) => e.data?.type === "order-ready" && void refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refetch);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refetch);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [initial.id, refetch]);

  // ---- Screen Wake Lock ----
  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      wakeLock.current = await navigator.wakeLock.request("screen");
      wakeLock.current.addEventListener("release", () => {
        wakeLock.current = null;
      });
    } catch {
      // Battery saver or unsupported — sound + push still work.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLock.current?.release();
    wakeLock.current = null;
  }, []);

  useEffect(() => {
    if (!alertOn || order.status === "done") return;
    // The lock is dropped whenever the page is hidden — take it again on return.
    const onVis = () => {
      if (document.visibilityState === "visible" && !wakeLock.current) void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [alertOn, order.status, requestWakeLock]);

  // ---- Alarm on status changes ----
  const audioUnlocked = useSyncExternalStore(subscribeAudio, isAudioUnlocked, () => false);
  const readyKey = order.ready_at ?? "ready"; // identifies this ready event
  const muted = order.status === "ready" && mutedFor === readyKey;
  const ringing = order.status === "ready" && !muted;
  // Page opened from a notification: sound needs one tap to unlock audio.
  const needsTap = ringing && !audioUnlocked;

  useEffect(() => {
    if (!ringing) return;
    if (audioUnlocked) startAlarm(order.alert_sound);
    else if ("vibrate" in navigator) navigator.vibrate?.([400, 150, 400]);
    return () => stopAlarm();
  }, [ringing, audioUnlocked, order.alert_sound]);

  useEffect(() => {
    if (order.status === "done") releaseWakeLock();
  }, [order.status, releaseWakeLock]);

  useEffect(() => {
    const base = `#${order.number}`;
    document.title = order.status === "ready" ? `🔔 ${d.statusReady} ${base}` : `${base} · ${d.statusPreparing}`;
  }, [order.status, order.number, d]);

  // ---- The single "Enable alert" gesture ----
  const enableAlert = async () => {
    // Everything that needs the user gesture is *started* synchronously, before any await.
    unlockAudio();
    void requestWakeLock();

    const pushCapable = pushSupported(vapidPublicKey);
    const permissionPromise = pushCapable ? Notification.requestPermission() : null;

    setAlertState("enabling");
    if (!permissionPromise) {
      setPushState("unsupported");
      setAlertState("on");
      return;
    }

    try {
      const permission = await permissionPromise;
      if (permission !== "granted") {
        setPushState("denied");
        setAlertState("on");
        return;
      }
      const sub = await getPushSubscription(vapidPublicKey);
      setPushState((await linkOrderToPush(order.id, sub)) ? "granted" : "error");
    } catch (err) {
      console.error(err);
      setPushState("error");
    }
    setAlertState("on");
  };

  const onReadyTap = () => {
    if (needsTap) unlockAudio(); // the alarm effect starts once audio is running
  };

  const stopSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMutedFor(readyKey);
    stopAlarm();
  };

  // ---- Render ----
  const header = (
    <header className={styles.header}>
      <div className={styles.restaurant}>
        {order.restaurant_logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={order.restaurant_logo_url} alt="" className={styles.logo} />
        ) : (
          <BrandMark size={34} color="var(--brand)" />
        )}
        <span>{order.restaurant_name}</span>
      </div>
      <div className={styles.headerActions}>
        {iosMode === "installed" && (
          <Link href="/c" className={`btn btn-ghost ${styles.lang}`}>
            {d.myOrders}
          </Link>
        )}
        <LangSwitch value={lang} onChange={switchLang} />
      </div>
    </header>
  );

  if (order.status === "ready") {
    return (
      <main
        dir={dir(lang)}
        lang={lang}
        className={`${styles.ready} ${muted ? styles.readyStill : ""}`}
        onClick={onReadyTap}
        role="alert"
        aria-live="assertive"
      >
        <div className={styles.readyInner}>
          <p className={styles.readyLabel}>{d.orderLabel}</p>
          <p className={styles.readyNumber}>
            <bdi>{order.number}</bdi>
          </p>
          <h1 className={styles.readyTitle}>{d.statusReady}</h1>
          <p className={styles.readySub}>{d.readyCta}</p>
          {needsTap ? (
            <p className={styles.tapHint}>{d.tapToHear}</p>
          ) : !muted ? (
            <button className={`btn btn-lg ${styles.stopBtn}`} onClick={stopSound}>
              {d.stopSound}
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main dir={dir(lang)} lang={lang} className={styles.page}>
      {header}
      {!connected && <p className={styles.offline}>{d.offline}</p>}

      <section className={`card ${styles.ticket}`}>
        <p className={styles.ticketLabel}>{d.orderLabel}</p>
        <p className={styles.number}>
          <bdi>{order.number}</bdi>
        </p>
        <div className={`${styles.status} ${order.status === "done" ? styles.statusDone : ""}`}>
          {order.status === "preparing" && <span className={styles.pulse} aria-hidden="true" />}
          {order.status === "done" ? d.statusDone : d.statusPreparing}
        </div>
        {order.status === "preparing" && <p className="muted">{d.preparingHint}</p>}
      </section>

      {order.status === "preparing" && (
        <section className={styles.actions}>
          {alertState === "on" ? (
            <div className={styles.enabled}>
              <p className={styles.enabledTitle}>✓ {d.alertOn}</p>
              <p>{d.alertOnHint}</p>
              {pushState === "granted" && <p className="muted">{d.alertOnHintPush}</p>}
              {pushState === "denied" && <p className="muted">{d.notifDenied}</p>}
              {pushState === "error" && <p className="error">{d.pushError}</p>}
            </div>
          ) : iosMode === "safari" ? (
            <>
              <div className={`card ${styles.install}`}>
                <p className={styles.installTitle}>{d.iosTitle}</p>
                <ol className={styles.steps}>
                  <li>
                    <span className={styles.stepIcon}><ShareIcon /></span>
                    <span>{d.iosStep1}</span>
                  </li>
                  <li>
                    <span className={styles.stepIcon}><AddIcon /></span>
                    <span>{d.iosStep2}</span>
                  </li>
                  <li>
                    <span className={styles.stepIcon}><BellIcon /></span>
                    <span>{d.iosStep3}</span>
                  </li>
                </ol>
                <p className={styles.alreadyApp}>{d.alreadyApp}</p>
              </div>
              <button className="btn btn-lg" onClick={enableAlert} disabled={alertState === "enabling"}>
                {d.iosKeepOpen}
              </button>
            </>
          ) : (
            <>
              {iosMode === "installed" && <p className={styles.installed}>{d.installedHint}</p>}
              <button className="btn btn-primary btn-xl" onClick={enableAlert} disabled={alertState === "enabling"}>
                <BellIcon /> {alertState === "enabling" ? d.enabling : d.enableAlert}
              </button>
              {iosMode === "safari-old" && <p className={styles.iosHint}>{d.iosOld}</p>}
            </>
          )}
        </section>
      )}

      <footer className={styles.footer}>
        <BrandMark size={16} color="var(--muted)" /> Nadi
      </footer>
    </main>
  );
}

function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
