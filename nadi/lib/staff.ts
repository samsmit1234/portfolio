import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerSupabase } from "./supabase/server";
import type { Restaurant } from "./types";

/** Current staff user + their restaurant (created on first visit). */
export const getStaffContext = cache(async () => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: restaurant } = await supabase.from("restaurants").select("*").eq("owner_id", user.id).maybeSingle();
  if (!restaurant) {
    const { data, error } = await supabase
      .from("restaurants")
      .insert({ owner_id: user.id, name: "Mon restaurant" })
      .select("*")
      .single();
    if (error?.code === "23505") {
      // Created concurrently by another tab — read it back.
      ({ data: restaurant } = await supabase.from("restaurants").select("*").eq("owner_id", user.id).single());
    } else if (error) {
      throw error;
    } else {
      restaurant = data;
    }
  }
  return { user, restaurant: restaurant as Restaurant };
});
