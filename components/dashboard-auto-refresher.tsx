"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function DashboardAutoRefresher({ roomId }: { roomId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`dashboard-refresh-${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auction_state", filter: `room_id=eq.${roomId}` },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
        router.refresh();
    }, 4500);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [roomId, router]);

  return null;
}
