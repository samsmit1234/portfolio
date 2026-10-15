import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPublicOrder } from "@/lib/public";
import { CustomerOrder } from "./CustomerOrder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Votre commande",
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await fetchPublicOrder(orderId);
  if (!order) notFound();
  return <CustomerOrder initial={order} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />;
}
