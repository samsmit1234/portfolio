import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerSupabase } from "./supabase/server";
import type { Restaurant, StaffRole } from "./types";

/**
 * Current signed-in user, the restaurant they work at and their role.
 * Someone with no membership gets their own restaurant (as owner) on first visit;
 * staff join an existing one through an invitation link (/join/<token>).
 */
export const getStaffContext = cache(async () => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const membership = async () => {
    const { data, error } = await supabase
      .from("restaurant_members")
      .select("role, restaurants(*)")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error?.code === "PGRST205" || error?.code === "42P01") {
      // Database not yet migrated to 0007_team.sql: owner-only, as before.
      const { data: own } = await supabase.from("restaurants").select("*").eq("owner_id", user.id).limit(1).maybeSingle();
      return own ? { role: "owner" as StaffRole, restaurants: own as Restaurant } : null;
    }
    if (error) throw error;
    return data as { role: StaffRole; restaurants: Restaurant } | null;
  };

  let m = await membership();
  if (!m) {
    // The insert trigger adds the owner membership.
    const { error } = await supabase.from("restaurants").insert({ owner_id: user.id, name: "Mon restaurant" });
    // 23505: created concurrently by another tab; read it back either way.
    if (error && error.code !== "23505") throw error;
    m = await membership();
    if (!m) throw new Error("restaurant membership missing after creation");
  }
  return { user, restaurant: m.restaurants, role: m.role, isOwner: m.role === "owner" };
});
