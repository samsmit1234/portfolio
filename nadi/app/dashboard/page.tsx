import type { Metadata } from "next";
import { getStaffContext } from "@/lib/staff";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";
import { OrdersBoard } from "./OrdersBoard";

export const metadata: Metadata = { title: "Commandes" };

const last24h = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

export default async function DashboardPage() {
  const { restaurant } = await getStaffContext();
  const supabase = await getServerSupabase();
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .gte("created_at", last24h())
    .order("created_at", { ascending: false });

  return (
    <OrdersBoard
      restaurantId={restaurant.id}
      lang={restaurant.language}
      initialOrders={(orders ?? []) as Order[]}
      siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
    />
  );
}
