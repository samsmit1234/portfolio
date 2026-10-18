import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Landing point of Supabase email links (sign-up confirmation, password reset).
 * Exchanges the PKCE `code` for a session cookie, then continues to `next`.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  // Only same-site paths: never redirect to another origin ("//evil.com").
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    console.error("auth callback: code exchange failed", error.message);
  }
  return NextResponse.redirect(new URL("/login?e=link", url.origin));
}
