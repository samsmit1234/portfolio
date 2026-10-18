import { NextResponse } from "next/server";
import { getAdminSupabase, getServerSupabase } from "@/lib/supabase/server";
import { sendReadyPush } from "@/lib/push";
import { getBaseUrl } from "@/lib/site";
import { UUID_RE } from "@/lib/public";
import type { Lang, OrderStatus } from "@/lib/types";

const STATUSES: OrderStatus[] = ["preparing", "ready", "done"];

/** Staff changes an order's status. "ready" also fires Web Push to the customer(s). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { status } = (await req.json().catch(() => ({}))) as { status?: OrderStatus };
  if (!status || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "bad_status" }, { status: 400 });
  }

  // Runs as the staff member: RLS guarantees the order belongs to their restaurant.
  const supabase = await getServerSupabase();
  const { data: order, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", id)
    .select("id, number, status, ready_at, restaurant_id, restaurants(name, language)")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let push = null;
  if (status === "ready") {
    const r = order.restaurants as unknown as { name: string; language: Lang } | null;
    push = await sendReadyPush({
      orderId: order.id,
      number: order.number,
      restaurantName: r?.name ?? "",
      lang: r?.language ?? "fr",
      baseUrl: await getBaseUrl(),
    });
  } else if (status === "done") {
    // Picked up: the customer's push endpoint is no longer needed.
    await getAdminSupabase().from("push_subscriptions").delete().eq("order_id", order.id);
  }

  return NextResponse.json({ order: { id: order.id, status: order.status, ready_at: order.ready_at }, push });
}
