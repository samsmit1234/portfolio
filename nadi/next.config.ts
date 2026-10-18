import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Supabase serves the REST/Auth API, Realtime (wss) and the logo bucket.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const supabaseHttp = supabase ?? "https://*.supabase.co";
const supabaseWs = supabase ? supabase.replace(/^https:/, "wss:") : "wss://*.supabase.co";

// Next.js inlines small scripts and styles, hence 'unsafe-inline'; dev mode also needs eval.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${supabaseHttp}`,
  `connect-src 'self' ${supabaseHttp} ${supabaseWs}`,
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Camera: in-app QR scanner. Wake lock: keeps the customer's screen on.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), screen-wake-lock=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker must never be served stale, and must control the whole origin.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
