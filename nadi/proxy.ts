import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safeNext";

/** Refreshes the Supabase session cookie and guards the staff dashboard. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Verifies the JWT locally when the project uses asymmetric signing keys (no
  // network call), refreshing the cookie when it has expired.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ?? null;

  const path = request.nextUrl.pathname;
  if (!user && path.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    // Already signed in: continue where the login was meant to lead (e.g. /join/<token>).
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  }
  return response;
}

export const config = {
  // Customer pages (/o, /r, /c), the SW, assets and the public subscribe API
  // never need the staff session; only the staff status API does.
  matcher: ["/dashboard/:path*", "/login", "/api/orders/:id/status", "/api/orders/:id/remind"],
};
