import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { sendReadyPush } from "@/lib/push";
import { getBaseUrl } from "@/lib/site";
import { UUID_RE } from "@/lib/public";
import type { Lang } from "@/lib/types";

/**
 * Staff: ring a ready order again. Updates rung_at (the customer page re-rings,
 * even if muted), restarts the automatic 30 s reminders, and re-sends the push.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Runs as the staff member: RLS limits this to their restaurant's orders.
  const supabase = await getServerSupabase();
  const now = new Date().toISOString();
  const { data: order, error } = await supabase
    .from("orders")
    .update({ rung_at: now, reminder_count: 0, last_reminded_at: now })
    .eq("id", id)
    .eq("status", "ready")
    .select("id, number, rung_at, restaurants(name, language)")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "not_ready" }, { status: 409 });

  const r = order.restaurants as unknown as { name: string; language: Lang } | null;
  const push = await sendReadyPush({
    orderId: order.id,
    number: order.number,
    restaurantName: r?.name ?? "",
    lang: r?.language ?? "fr",
    baseUrl: await getBaseUrl(),
    reminder: true,
  });
  return NextResponse.json({ order: { id: order.id, rung_at: order.rung_at }, push });
}
