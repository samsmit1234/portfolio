import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/server";
import { sendReadyPush } from "@/lib/push";
import { getBaseUrl } from "@/lib/site";
import type { Lang } from "@/lib/types";

/**
 * Called every 30 s by Supabase pg_cron (see migrations/0002_reminders.sql) while
 * some ready order is waiting. claim_due_reminders() hands out each due order at
 * most once per 25 s, so extra calls to this public endpoint send nothing more.
 */
export async function POST() {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc("claim_due_reminders");
  if (error) {
    console.error("reminders: claim failed", error.message);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }
  const due = (data ?? []) as { id: string; number: string; restaurant_name: string; language: Lang }[];
  const baseUrl = await getBaseUrl();
  const results = await Promise.all(
    due.map((o) =>
      sendReadyPush({
        orderId: o.id,
        number: o.number,
        restaurantName: o.restaurant_name,
        lang: o.language,
        baseUrl,
        reminder: true,
      }),
    ),
  );
  return NextResponse.json({ reminded: due.length, sent: results.reduce((n, r) => n + r.sent, 0) });
}
