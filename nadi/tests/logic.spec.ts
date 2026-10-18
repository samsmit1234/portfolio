// Unit tests for the pure helpers (no browser, no server): npm run test:unit
import { expect, test } from "@playwright/test";
import { isAllowedPushEndpoint } from "../lib/pushEndpoint";
import { formatNumber, nextNumber } from "../lib/numbering";
import { buildStats, hourlyFromOrders } from "../lib/stats";
import { safeNext } from "../lib/safeNext";
import type { Order } from "../lib/types";

test("push endpoints: only the browser push services, over plain https", () => {
  const cases: [string, boolean][] = [
    ["https://fcm.googleapis.com/fcm/send/abc", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/x", true],
    ["https://web.push.apple.com/QX", true],
    ["https://wns2-par02p.notify.windows.com/w/?token=1", true],
    ["https://FCM.googleapis.com/x", true],
    ["http://fcm.googleapis.com/x", false],
    ["https://fcm.googleapis.com:8443/x", false],
    ["https://user:pw@fcm.googleapis.com/x", false],
    ["https://evil.com/x", false],
    ["https://fcm.googleapis.com.evil.com/x", false],
    ["https://evilpush.apple.com/x", false],
    ["https://push.apple.com.evil.com/x", false],
    ["https://169.254.169.254/latest", false],
    ["https://localhost/x", false],
    ["not a url", false],
  ];
  for (const [url, allowed] of cases) expect(isAllowedPushEndpoint(url), url).toBe(allowed);
});

test("order numbering: prefix, padding, daily reset", () => {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 864e5).toISOString();
  const o = (number: string, created_at = now): Order => ({ id: number, restaurant_id: "r", number, status: "done", created_at, ready_at: null });
  const base = { number_prefix: "", number_digits: 0, daily_reset: true, timezone: "Africa/Casablanca" };
  const prefixed = { ...base, number_prefix: "A-", number_digits: 3 };

  expect(nextNumber([], base)).toBe("1");
  expect(nextNumber([o("4"), o("12")], base)).toBe("13");
  expect(nextNumber([o("40", yesterday), o("2")], base)).toBe("3");
  expect(nextNumber([o("40", yesterday), o("2")], { ...base, daily_reset: false })).toBe("41");
  expect(nextNumber([o("A-007"), o("B-050"), o("9")], prefixed)).toBe("A-008");
  expect(nextNumber([o("a-2")], { ...prefixed, number_digits: 2 })).toBe("A-03");
  expect(nextNumber([], prefixed)).toBe("A-001");
  expect(nextNumber([], { ...base, timezone: "Not/AZone" })).toBe("1");
  expect(formatNumber(7, { number_prefix: "", number_digits: 0 })).toBe("7");
});

test("stats: days and hours in the restaurant's time zone", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const live = hourlyFromOrders([
    { created_at: "2026-10-18T11:10:00Z", ready_at: "2026-10-18T11:20:00Z" },
    { created_at: "2026-10-18T11:40:00Z", ready_at: "2026-10-18T11:50:00Z" },
    { created_at: "2026-10-18T11:45:00Z", ready_at: null },
    { created_at: "2026-10-17T23:30:00Z", ready_at: "2026-10-18T05:00:00Z" }, // over 3 h: not a preparation time
  ]);
  const s = buildStats(
    [
      ...live,
      { hour: "2026-10-12T19:00:00Z", orders: 5, prep_samples: 4, prep_seconds: 2400 },
      { hour: "2026-10-01T19:00:00Z", orders: 9, prep_samples: 1, prep_seconds: 60 }, // outside the 7 days
    ],
    "Africa/Casablanca", // UTC+1
    7,
    now,
  );
  expect(s.total).toBe(9);
  expect(s.days.map((d) => d.day)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  expect(s.days[0]).toEqual({ day: "2026-10-12", orders: 5, avgPrepSeconds: 600 });
  expect(s.days[6]).toEqual({ day: "2026-10-18", orders: 4, avgPrepSeconds: 600 }); // 23:30Z is 00:30 local
  expect(s.avgPrepSeconds).toBe(600);
  expect(s.hours[12]).toBe(3);
  expect(s.hours[20]).toBe(5);
  expect(s.hours[0]).toBe(1);
});

test("safeNext: same-site paths only", () => {
  expect(safeNext("/join/abc")).toBe("/join/abc");
  expect(safeNext("//evil.com")).toBe("/dashboard");
  expect(safeNext("/\\evil.com")).toBe("/dashboard");
  expect(safeNext("https://evil.com")).toBe("/dashboard");
  expect(safeNext(null, "/update-password")).toBe("/update-password");
});
