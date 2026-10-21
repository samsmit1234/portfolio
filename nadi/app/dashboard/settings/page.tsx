import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/staff";
import { SettingsForm } from "./SettingsForm";
import { TeamSection } from "./TeamSection";

export const metadata: Metadata = { title: { absolute: "Nadi" } };

export default async function SettingsPage() {
  const { restaurant, isOwner, user } = await getStaffContext();
  // Staff run the board only; settings and team belong to the owner.
  if (!isOwner) redirect("/dashboard");
  return (
    <>
      <SettingsForm restaurant={restaurant} />
      <TeamSection lang={restaurant.language} myUserId={user.id} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""} />
    </>
  );
}
