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
    // Home Screen icon (iPhone) reopens this order.
    manifest: order ? `/o/${order.id}/manifest.webmanifest` : undefined,
    appleWebApp: { capable: true, title: order ? `Nadi #${order.number}` : "Nadi", statusBarStyle: "default" },
  };
}

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await fetchPublicOrder(orderId);
  if (!order) notFound();
  return <CustomerOrder initial={order} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />;
}
