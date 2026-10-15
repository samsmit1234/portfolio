import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPublicOrder } from "@/lib/public";
import { CustomerOrder } from "./CustomerOrder";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ orderId: string }> }): Promise<Metadata> {
  const { orderId } = await params;
  const order = await fetchPublicOrder(orderId);
  return {
    title: order ? `#${order.number}` : "Votre commande",
    robots: { index: false, follow: false },
    // Adding to the Home Screen installs the one customer app (/c), opening on this order.
    manifest: order ? `/c/manifest.webmanifest?o=${order.id}` : "/c/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Nadi", statusBarStyle: "default" },
  };
}

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await fetchPublicOrder(orderId);
  if (!order) notFound();
  return <CustomerOrder initial={order} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />;
}
