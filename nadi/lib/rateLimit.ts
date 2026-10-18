import "server-only";

import { getAdminSupabase } from "./supabase/server";

/** Best guess of the caller's IP behind Netlify / Vercel / a generic proxy. */
export function clientIp(h: Headers): string {
  return (
    h.get("x-nf-client-connection-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Records one hit for `key` and returns false once it exceeds `limit` hits in
 * `windowSeconds`. Fails open (returns true) if the database call fails, so a
 * Supabase hiccup never blocks customers.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed", error.message);
    return true;
  }
  return data === true;
}
