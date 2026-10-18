"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { dir, isLang, t } from "@/lib/i18n";
import { unlockAudio } from "@/lib/sound";
import {
  getPushSubscription,
  linkOrderToPush,
  ORDER_URL_RE,
  pushSupported,
  readMyOrders,
  rememberOrder,
  writeMyOrders,
} from "@/lib/pushClient";
import type { Lang, PublicOrder } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";
import styles from "./app.module.css";

type Perm = "unsupported" | "default" | "granted" | "denied";

/**
 * The installed customer app. Customers add it to the Home Screen once; for each
 * new order they scan its QR here, and the order is linked to this device's push
 * subscription, so "ready" reaches them even when they are in another app.
 */
export function CustomerApp({ vapidPublicKey, firstOrderId }: { vapidPublicKey: string; firstOrderId: string | null }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("fr");
  const [ids, setIds] = useState<string[]>([]);
  const [orders, setOrders] = useState<Record<string, PublicOrder>>({});
  const [perm, setPerm] = useState<Perm>("default");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevStatus = useRef<Record<string, string>>({});
  const d = t(lang);

  // ---- Boot: language, remembered orders, permission ----
  /* eslint-disable react-hooks/set-state-in-effect -- browser-only values (localStorage, user agent) can only be read after hydration */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nadi:lang");
      if (isLang(saved)) setLang(saved);
    } catch {}
    if (firstOrderId) rememberOrder(firstOrderId);
    setIds(readMyOrders());
    if (!pushSupported(vapidPublicKey)) setPerm("unsupported");
    else setPerm(Notification.permission as Perm);
  }, [firstOrderId, vapidPublicKey]);
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

  // ---- Data ----
  const refresh = useCallback(async (list: string[]) => {
    if (!list.length) return;
    const supabase = getBrowserSupabase();
    const results = await Promise.all(
      list.map(async (id) => {
        const { data, error } = await supabase.rpc("get_public_order", { p_order_id: id });
        if (error) return [id, undefined] as const; // network hiccup: keep what we have
        return [id, (data?.[0] as PublicOrder | undefined) ?? null] as const;
      }),
    );
    const gone = results.filter(([, o]) => o === null).map(([id]) => id);
    if (gone.length) {
      const keep = readMyOrders().filter((id) => !gone.includes(id));
      writeMyOrders(keep);
      setIds(keep);
    }
    setOrders((prev) => {
      const next = { ...prev };
      for (const [id, o] of results) {
        if (o) next[id] = o;
        else if (o === null) delete next[id];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- network fetch; state is set after it resolves
    void refresh(ids);
    const poll = setInterval(() => void refresh(ids), 10_000);
    const onVisible = () => document.visibilityState === "visible" && void refresh(ids);
    document.addEventListener("visibilitychange", onVisible);

    const supabase = getBrowserSupabase();
    const channels: ReturnType<typeof supabase.channel>[] = [];
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      for (const id of ids) {
        channels.push(
          supabase
            .channel(`order:${id}`, { config: { private: true } })
            .on("broadcast", { event: "order_update" }, () => void refresh([id]))
            .subscribe(),
        );
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      channels.forEach((c) => void supabase.removeChannel(c));
    };
  }, [ids, refresh]);

  // An order turning ready while the app is open: jump to its full-screen alert.
  useEffect(() => {
    for (const o of Object.values(orders)) {
      const before = prevStatus.current[o.id];
      prevStatus.current[o.id] = o.status;
      if (before && before !== "ready" && o.status === "ready" && document.visibilityState === "visible") {
        router.push(`/o/${o.id}`);
        return;
      }
    }
  }, [orders, router]);

  // Once notifications are allowed, every order in the list is linked to this device.
  const linkAll = useCallback(
    async (list: string[]) => {
      const sub = await getPushSubscription(vapidPublicKey);
      const results = await Promise.all(list.map((id) => linkOrderToPush(id, sub).catch(() => false)));
      return results.every(Boolean);
    },
    [vapidPublicKey],
  );

  useEffect(() => {
    if (perm === "granted" && ids.length) void linkAll(ids).catch(() => {});
  }, [perm, ids, linkAll]);

  const enableNotifications = async () => {
    unlockAudio(); // same tap also unlocks sound for the in-app alert
    if (perm === "unsupported") return;
    setBusy(true);
    setError(null);
    try {
      const p = await Notification.requestPermission();
      setPerm(p as Perm);
      if (p === "granted" && ids.length && !(await linkAll(ids))) setError(d.pushError);
    } catch {
      setError(d.pushError);
    }
    setBusy(false);
  };

  const addOrder = useCallback(
    (id: string) => {
      rememberOrder(id);
      const list = readMyOrders();
      setIds(list);
      void refresh([id]);
    },
    [refresh],
  );

  const removeOrder = (id: string) => {
    const keep = readMyOrders().filter((x) => x !== id);
    writeMyOrders(keep);
    setIds(keep);
    setOrders((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const list = ids.map((id) => orders[id]).filter(Boolean) as PublicOrder[];
  const statusLabel = (o: PublicOrder) =>
    o.status === "ready" ? d.statusReady : o.status === "done" ? d.statusDone : d.statusPreparing;

  return (
    <main dir={dir(lang)} lang={lang} className={styles.page}>
      <header className={styles.header}>
        <div className="brand-row">
          <BrandMark size={32} color="var(--brand)" /> Nadi
        </div>
        <LangSwitch value={lang} onChange={switchLang} />
      </header>

      <button
        className="btn btn-primary btn-xl"
        onClick={() => {
          unlockAudio();
          setScanning(true);
        }}
      >
        <ScanIcon /> {d.scan}
      </button>

      {perm === "default" && (
        <section className={`card ${styles.enable}`}>
          <p>{d.enableOnceHint}</p>
          <button className="btn btn-ready btn-lg" onClick={enableNotifications} disabled={busy}>
            {busy ? d.enabling : d.enableOnce}
          </button>
        </section>
      )}
      {perm === "granted" && <p className={styles.on}>✓ {d.notifOn}</p>}
      {perm === "denied" && <p className={styles.warn}>{d.notifDenied}</p>}
      {error && <p className="error">{error}</p>}

      <section className={styles.list}>
        <h1 className={styles.title}>{d.myOrders}</h1>
        {list.length === 0 && <p className={styles.empty}>{d.noOrders}</p>}
        {list.map((o) => (
          <div key={o.id} className={`${styles.order} ${styles[o.status] ?? ""}`}>
            <Link href={`/o/${o.id}`} className={styles.orderLink}>
              <span className={styles.num} dir="ltr">
                {o.number}
              </span>
              <span className={styles.meta}>
                <span className={styles.rest}>{o.restaurant_name}</span>
                <span className={styles.status}>{statusLabel(o)}</span>
              </span>
            </Link>
            {o.status === "done" && (
              <button className="btn btn-ghost" onClick={() => removeOrder(o.id)}>
                {d.remove}
              </button>
            )}
          </div>
        ))}
      </section>

      {scanning && (
        <Scanner
          hint={d.scanHint}
          closeLabel={d.close}
          deniedLabel={d.cameraDenied}
          onClose={() => setScanning(false)}
          onFound={(id) => {
            setScanning(false);
            addOrder(id);
          }}
        />
      )}
    </main>
  );
}

function Scanner({
  hint,
  closeLabel,
  deniedLabel,
  onClose,
  onFound,
}: {
  hint: string;
  closeLabel: string;
  deniedLabel: string;
  onClose: () => void;
  onFound: (orderId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [denied, setDenied] = useState(false);
  // Keep the camera running across parent re-renders (the order list polls).
  const onFoundRef = useRef(onFound);
  useLayoutEffect(() => {
    onFoundRef.current = onFound;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
        const m = code?.data.match(ORDER_URL_RE);
        if (m) {
          if ("vibrate" in navigator) navigator.vibrate?.(80);
          onFoundRef.current(m[1].toLowerCase());
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        const v = videoRef.current!;
        v.srcObject = s;
        void v.play();
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setDenied(true));

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <div className={styles.scanner} role="dialog" aria-modal="true">
      {denied ? (
        <p className={styles.scanDenied}>{deniedLabel}</p>
      ) : (
        <>
          <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
          <div className={styles.frame} aria-hidden="true" />
          <p className={styles.scanHint}>{hint}</p>
        </>
      )}
      <button className={`btn btn-lg ${styles.scanClose}`} onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}

function ScanIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <path d="M7 12h10" />
    </svg>
  );
}
