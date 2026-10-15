"use client";

import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await getBrowserSupabase().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
