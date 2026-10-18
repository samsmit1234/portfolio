"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { locale, t } from "@/lib/i18n";
import { friendlyError } from "@/lib/errors";
import type { Lang, Order, OrderStatus, Restaurant } from "@/lib/types";
import { nextNumber } from "@/lib/numbering";
import { QrModal } from "@/components/QrModal";
import styles from "./dashboard.module.css";


/** Ready orders not picked up after this many minutes are highlighted. */
const LATE_AFTER_MIN = 4;

function sortOrders(list: Order[]) {
  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function OrdersBoard({
  restaurantId,
  lang,
  initialOrders,
  siteUrl,
  numbering,
}: {
  numbering: Pick<Restaurant, "number_prefix" | "number_digits" | "daily_reset" | "timezone">;
  restaurantId: string;
  lang: Lang;
  initialOrders: Order[];
  siteUrl: string;
}) {
  const d = t(lang);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [number, setNumber] = useState(() => nextNumber(initialOrders, numbering));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [qr, setQr] = useState<{ url: string; big?: string; title: string; subtitle?: string } | null>(null);
  const numberTouched = useRef(false);
  // Clock for "ready for X min" and the late highlight.
  const [now, setNow] = useState(() => Date.parse(initialOrders[0]?.created_at ?? "1970-01-01"));
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 30_000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, []);

  const upsert = useCallback((o: Order) => {
    setOrders((list) => sortOrders([o, ...list.filter((x) => x.id !== o.id)]));
  }, []);

  // Full reload of the board (last 24 h). Realtime events missed while the
  // tablet slept or the network dropped are never replayed, so resync on
  // (re)connect, when the page becomes visible, when back online, and every 30 s.
  const refetch = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await getBrowserSupabase()
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (!error && data) setOrders(sortOrders(data as Order[]));
  }, [restaurantId]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void refetch();
    const onOnline = () => void refetch();
    const timer = setInterval(() => void refetch(), 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [refetch]);

  // Live updates from other staff devices.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel(`restaurant:${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Partial<Order>).id;
            setOrders((list) => list.filter((x) => x.id !== id));
          } else {
            upsert(payload.new as Order);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refetch();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, upsert, refetch]);

  // Keep the suggested next number fresh until staff types their own.
  useEffect(() => {
    if (!numberTouched.current) setNumber(nextNumber(orders, numbering));
  }, [orders, numbering]);

  // Only called from click handlers, so window is always available.
  const base = () => siteUrl || window.location.origin;
  const orderUrl = (id: string) => `${base()}/o/${id}`;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = number.trim();
    if (!n) return;
    if (orders.some((o) => o.status !== "done" && o.number.toLowerCase() === n.toLowerCase())) {
      setError(d.duplicateNumber);
      return;
    }
    setError(null);
    setCreating(true);
    const { data, error } = await getBrowserSupabase()
      .from("orders")
      .insert({ restaurant_id: restaurantId, number: n })
      .select("*")
      .single();
    setCreating(false);
    if (error || !data) {
      // 23505 = orders_open_number_uniq: another device just created this number.
      setError(friendlyError(error, d));
      return;
    }
    upsert(data as Order);
    numberTouched.current = false;
    setQr({ url: orderUrl(data.id), big: data.number, title: d.qrTitle });
  };

  // "Rappeler": re-send the push and re-ring the customer's page.
  const remind = async (o: Order) => {
    setBusyId(o.id);
    try {
      const res = await fetch(`/api/orders/${o.id}/remind`, { method: "POST" });
      if (!res.ok) setError(friendlyError(res.status, d));
    } catch {
      setError(d.errNetwork);
    }
    setBusyId(null);
  };

  const setStatus = async (o: Order, status: OrderStatus) => {
    setBusyId(o.id);
    const prev = o;
    upsert({ ...o, status, ready_at: status === "ready" ? new Date().toISOString() : status === "preparing" ? null : o.ready_at });
    try {
      const res = await fetch(`/api/orders/${o.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        upsert(prev);
        setError(friendlyError(res.status, d));
      }
    } catch {
      upsert(prev);
      setError(d.errNetwork);
    }
    setBusyId(null);
  };

  const groups = useMemo(
    () => ({
      preparing: orders.filter((o) => o.status === "preparing").reverse(), // oldest first: FIFO
      ready: orders.filter((o) => o.status === "ready"),
      done: orders.filter((o) => o.status === "done").slice(0, 30),
    }),
    [orders],
  );

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit" });

  return (
    <main className={styles.main}>
      <section className={styles.toolbar}>
        <form onSubmit={create} className={styles.createForm}>
          <label className={styles.createLabel} htmlFor="order-number">{d.newOrder}</label>
          <input
            id="order-number"
            className={`input ${styles.numberInput}`}
            value={number}
            onChange={(e) => {
              numberTouched.current = true;
              setNumber(e.target.value);
            }}
            maxLength={12}
            inputMode="numeric"
            aria-label={d.orderNumber}
            dir="ltr"
          />
          <button className="btn btn-primary btn-lg" disabled={creating || !number.trim()}>
            + {d.create}
          </button>
        </form>
        <button
          className="btn"
          onClick={() => setQr({ url: `${base()}/r/${restaurantId}`, title: d.counterQr, subtitle: d.counterQrHint })}
        >
          {d.counterQr}
        </button>
      </section>
      {error && <p className={`error ${styles.errorBar}`}>{error}</p>}

      <div className={styles.columns}>
        <Column title={d.colPreparing} count={groups.preparing.length} tone="wait">
          {groups.preparing.map((o) => (
            <article key={o.id} className={styles.order}>
              <div className={styles.orderHead}>
                <span className={styles.orderNumber} dir="ltr">{o.number}</span>
                <span className="muted">{time(o.created_at)}</span>
              </div>
              <div className={styles.orderActions}>
                <button
                  className={`btn btn-ready btn-xl ${styles.readyBtn}`}
                  disabled={busyId === o.id}
                  onClick={() => setStatus(o, "ready")}
                >
                  {d.markReady}
                </button>
                <button className="btn" onClick={() => setQr({ url: orderUrl(o.id), big: o.number, title: d.qrTitle })}>
                  {d.showQr}
                </button>
              </div>
            </article>
          ))}
          {!groups.preparing.length && <p className={styles.empty}>{d.empty}</p>}
        </Column>

        <Column title={d.colReady} count={groups.ready.length} tone="ready">
          {groups.ready.map((o) => {
            const waited = o.ready_at ? Math.max(0, Math.floor((now - Date.parse(o.ready_at)) / 60_000)) : 0;
            const late = waited >= LATE_AFTER_MIN;
            return (
              <article key={o.id} className={`${styles.order} ${styles.orderReady} ${late ? styles.orderLate : ""}`}>
                <div className={styles.orderHead}>
                  <span className={styles.orderNumber} dir="ltr">{o.number}</span>
                  <span className={late ? styles.lateLabel : "muted"}>
                    {waited >= 1 ? d.waitingFor.replace("{min}", String(waited)) : o.ready_at ? time(o.ready_at) : ""}
                  </span>
                </div>
                <div className={styles.orderActions}>
                  <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={busyId === o.id} onClick={() => setStatus(o, "done")}>
                    {d.markDone}
                  </button>
                  <button className="btn" disabled={busyId === o.id} onClick={() => remind(o)}>
                    {d.remind}
                  </button>
                  <button className="btn" disabled={busyId === o.id} onClick={() => setStatus(o, "preparing")}>
                    {d.undo}
                  </button>
                </div>
              </article>
            );
          })}
          {!groups.ready.length && <p className={styles.empty}>{d.empty}</p>}
        </Column>

        <Column title={d.colDone} count={groups.done.length} tone="done">
          {groups.done.map((o) => (
            <article key={o.id} className={`${styles.order} ${styles.orderDone}`}>
              <div className={styles.orderHead}>
                <span className={styles.orderNumber} dir="ltr">{o.number}</span>
                <span className="muted">{time(o.created_at)}</span>
              </div>
            </article>
          ))}
          {!groups.done.length && <p className={styles.empty}>{d.empty}</p>}
        </Column>
      </div>

      {qr && (
        <QrModal
          url={qr.url}
          big={qr.big}
          title={qr.title}
          subtitle={qr.subtitle}
          onClose={() => setQr(null)}
          closeLabel={d.close}
          printLabel={d.print}
        />
      )}
    </main>
  );
}

function Column({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count: number;
  tone: "wait" | "ready" | "done";
  children: React.ReactNode;
}) {
  return (
    <section className={styles.column} data-tone={tone}>
      <h2 className={styles.columnTitle}>
        <span className={styles.toneDot} /> {title} <span className={styles.count}>{count}</span>
      </h2>
      <div className={styles.columnBody}>{children}</div>
    </section>
  );
}
