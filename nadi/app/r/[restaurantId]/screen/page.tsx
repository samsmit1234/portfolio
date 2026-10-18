import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnonSupabase, UUID_RE } from "@/lib/public";
import { isLang } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { ScreenBoard, type ScreenRow } from "./ScreenBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Écran salle", robots: { index: false } };

/** Dining-room TV: numbers being prepared and ready, live. Public, numbers only. */
export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(restaurantId)) notFound();

  const supabase = getAnonSupabase();
  const [{ data: r }, { data: rows }] = await Promise.all([
    supabase.rpc("get_public_restaurant", { p_restaurant_id: restaurantId }),
    supabase.rpc("screen_orders", { p_restaurant_id: restaurantId }),
  ]);
  const restaurant = r?.[0] as { id: string; name: string; logo_url: string | null; language: Lang } | undefined;
  if (!restaurant) notFound();

  return (
    <ScreenBoard
      restaurant={restaurant}
      lang={isLang(sp.lang) ? sp.lang : restaurant.language}
      initialRows={(rows ?? []) as ScreenRow[]}
    />
  );
}
