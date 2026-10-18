import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

/**
 * Landing point of Supabase email links (sign-up confirmation, password reset).
 * Exchanges the PKCE `code` for a session cookie, then continues to `next`.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  // Only same-site paths: never redirect to another origin ("//evil.com").
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    console.error("auth callback: code exchange failed", error.message);
  }
  return NextResponse.redirect(new URL("/login?e=link", url.origin));
}
