import { UUID_RE } from "@/lib/public";

/**
 * The customer app manifest. iPhone only delivers web push to apps added to the
 * Home Screen, so customers add "Nadi" once and then scan each new order inside it.
 * `?o=<orderId>` makes the first launch open with the order that was being viewed.
 */
export async function GET(req: Request) {
  const o = new URL(req.url).searchParams.get("o");
  const start = o && UUID_RE.test(o) ? `/c?o=${o}` : "/c";
  const manifest = {
    id: "/c",
    name: "Nadi",
    short_name: "Nadi",
    description: "Votre commande vous appelle.",
    start_url: start,
    scope: "/",
    display: "standalone",
    background_color: "#FFF7EC",
    theme_color: "#FF5A36",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
  });
}
