// Minimal stand-in for the Supabase APIs the app calls during the e2e tests
// (auth user, PostgREST tables/RPCs). Realtime is not emulated: the pages
// fall back to polling, which is part of what the tests cover.
import http from "node:http";

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54321);
export const USER = { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "chef@example.com" };
export const RESTAURANT = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  name: "Test Sushi",
  logo_url: null,
  owner_id: USER.id,
  alert_sound: "chime",
  language: "fr",
  number_prefix: "",
  number_digits: 0,
  daily_reset: true,
  timezone: "Africa/Casablanca",
  created_at: new Date().toISOString(),
};

let orders = [];

const json = (res, body, status = 200) => {
  res.statusCode = status;
  res.end(JSON.stringify(body));
};

function publicOrder(o) {
  return {
    id: o.id, number: o.number, status: o.status, created_at: o.created_at, ready_at: o.ready_at, rung_at: o.rung_at,
    restaurant_name: RESTAURANT.name, restaurant_logo_url: null, alert_sound: RESTAURANT.alert_sound, language: RESTAURANT.language,
    avg_prep_seconds: null, ahead_count: o.status === "preparing" ? 0 : null,
  };
}

// set_ready_at() trigger
function applyStatus(o, status) {
  if (status === "ready" && o.status !== "ready") Object.assign(o, { ready_at: new Date().toISOString(), rung_at: new Date().toISOString() });
  if (status === "preparing") Object.assign(o, { ready_at: null, rung_at: null });
  o.status = status;
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Content-Type", "application/json");
      if (req.method === "OPTIONS") return res.end();
      const url = new URL(req.url, "http://mock");
      const path = url.pathname;
      const body = raw ? JSON.parse(raw) : {};
      const single = (req.headers.accept || "").includes("vnd.pgrst.object");

      if (path === "/__reset") return (orders = []), json(res, {});
      if (path === "/__orders") return json(res, orders);

      if (path === "/auth/v1/user") return json(res, USER);
      if (path === "/rest/v1/restaurant_members") return json(res, [{ role: "owner", restaurants: RESTAURANT }]);
      if (path === "/rest/v1/restaurants") return json(res, single ? RESTAURANT : [RESTAURANT]);
      if (path === "/rest/v1/push_subscriptions") return json(res, []);
      if (path === "/rest/v1/rpc/get_public_restaurant")
        return json(res, [{ id: RESTAURANT.id, name: RESTAURANT.name, logo_url: null, language: RESTAURANT.language }]);
      if (path === "/rest/v1/rpc/get_public_order") {
        const o = orders.find((x) => x.id === body.p_order_id);
        return json(res, o ? [publicOrder(o)] : []);
      }
      if (path === "/rest/v1/rpc/screen_orders")
        return json(res, orders.filter((o) => o.status !== "done").map((o) => ({ number: o.number, status: o.status, since: o.ready_at || o.created_at })));

      if (path === "/rest/v1/orders") {
        const idFilter = url.searchParams.get("id")?.replace(/^eq\./, "");
        if (req.method === "GET") return json(res, [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)));
        if (req.method === "POST") {
          if (orders.some((o) => o.status !== "done" && o.number.toLowerCase() === String(body.number).toLowerCase()))
            return json(res, { code: "23505", message: "duplicate key value violates unique constraint" }, 409);
          const o = { id: crypto.randomUUID(), restaurant_id: RESTAURANT.id, number: body.number, status: "preparing", created_at: new Date().toISOString(), ready_at: null, rung_at: null };
          orders.unshift(o);
          return json(res, single ? o : [o], 201);
        }
        if (req.method === "PATCH") {
          const o = orders.find((x) => x.id === idFilter);
          if (!o) return single ? json(res, { code: "PGRST116", message: "0 rows" }, 406) : json(res, []);
          const { status, ...rest } = body;
          if (status) applyStatus(o, status);
          Object.assign(o, rest);
          const row = { ...o, restaurants: { name: RESTAURANT.name, language: RESTAURANT.language } };
          return json(res, single ? row : [row]);
        }
      }
      json(res, { message: `mock: no route for ${req.method} ${path}` }, 404);
    });
  })
  .listen(PORT, () => console.log(`mock supabase on :${PORT}`));
