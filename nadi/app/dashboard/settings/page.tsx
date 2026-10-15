import type { Metadata } from "next";
import { getStaffContext } from "@/lib/staff";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const { restaurant } = await getStaffContext();
  return <SettingsForm restaurant={restaurant} />;
}
