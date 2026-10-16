import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

// Anything that changes for this competition refreshes the screen: nobody has to reload.
export function useRealtime(compId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!compId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => qc.invalidateQueries({ queryKey: ["c", compId] }), 250); };
    const ch = supabase.channel("comp-" + compId);
    for (const table of ["feed_events", "fixtures", "results", "announcements", "teams", "registrations", "lineups", "americano_events", "americano_matches", "awards"])
      ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `competition_id=eq.${compId}` }, refresh);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, refresh);
    ch.subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [compId, qc]);
}
