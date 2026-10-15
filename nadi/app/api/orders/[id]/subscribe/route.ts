import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/public";

const MAX_SUBS_PER_ORDER = 10;

/** Customer saves its PushSubscription for one order. Public — the UUID is the capability. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (
    typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000 ||
    typeof p256dh !== "string" || p256dh.length > 200 ||
    typeof auth !== "string" || auth.length > 100
  ) {
    console.error("subscribe: bad subscription", typeof endpoint === "string" ? endpoint.slice(0, 40) : typeof endpoint);
    return NextResponse.json({ error: "bad_subscription" }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: order } = await admin.from("orders").select("id, status").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (order.status === "done") return NextResponse.json({ error: "order_done" }, { status: 409 });

  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("order_id", id);
  if ((count ?? 0) >= MAX_SUBS_PER_ORDER) {
    return NextResponse.json({ error: "too_many" }, { status: 429 });
  }

  const { error } = await admin
    .from("push_subscriptions")
    .upsert({ order_id: id, endpoint, p256dh, auth }, { onConflict: "order_id,endpoint" });
  if (error) {
    console.error("subscribe: db error", error.message);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  console.log("subscribe: ok", new URL(endpoint).host);

  return NextResponse.json({ ok: true });
}
