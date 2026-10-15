import { fetchPublicOrder } from "@/lib/public";

/**
 * Per-order PWA manifest. On iPhone, web push only works once the page is added
 * to the Home Screen; this makes that icon reopen *this* order, not the dashboard.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  const order = await fetchPublicOrder(orderId);
  if (!order) return new Response("Not found", { status: 404 });

  const manifest = {
    id: `/o/${order.id}`,
    name: `${order.restaurant_name} · #${order.number}`,
    short_name: `Nadi #${order.number}`,
    start_url: `/o/${order.id}`,
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
