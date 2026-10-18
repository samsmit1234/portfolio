import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { PublicOrder } from "./types";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anonymous client — exactly what a customer's browser is allowed to do. */
export function getAnonSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** One RPC per request, even when both generateMetadata and the page ask. */
export const fetchPublicOrder = cache(async (id: string): Promise<PublicOrder | null> => {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await getAnonSupabase().rpc("get_public_order", { p_order_id: id });
  if (error || !data?.length) return null;
  return data[0] as PublicOrder;
});
