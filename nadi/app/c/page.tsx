import type { Metadata } from "next";
import { UUID_RE } from "@/lib/public";
import { CustomerApp } from "./CustomerApp";

export const metadata: Metadata = {
  title: { absolute: "Nadi" },
  robots: { index: false, follow: false },
  manifest: "/c/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nadi", statusBarStyle: "default" },
};

export default async function CustomerAppPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const { o } = await searchParams;
  return (
    <CustomerApp
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      firstOrderId={o && UUID_RE.test(o) ? o.toLowerCase() : null}
    />
  );
}
