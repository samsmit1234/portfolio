import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/server";

/** Vercel Cron: deletes orders (and, by cascade, their push subscriptions) older than 24h. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await getAdminSupabase().rpc("cleanup_old_orders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: data });
}
