import { useEffect, useRef } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { usePrefs } from "./data";
import { feedText } from "@/components/FeedList";
import { useToast } from "@/components/ui";
import type { FeedEvent, Prefs } from "@/types";

const CATEGORY: Record<string, keyof Prefs> = {
  result_approved: "results", americano_completed: "results", fixture_scheduled: "fixtures", fixtures_generated: "fixtures", fixtures_regenerated: "fixtures",
  announcement: "announcements", tribe_revealed: "reveals", awards_published: "reveals",
};
/** In-app notifications while the app is open, honouring each player's preferences. (No push or email is sent.) */
export function useLiveToasts(compId: string | undefined) {
  const { user } = useAuth(); const toast = useToast(); const prefs = usePrefs(user?.id);
  const p = useRef<Prefs | undefined>(undefined);
  useEffect(() => { p.current = prefs.data; }, [prefs.data]);
  useEffect(() => {
    if (!compId) return;
    const ch = supabase.channel("toasts-" + compId).on("postgres_changes", { event: "INSERT", schema: "public", table: "feed_events", filter: `competition_id=eq.${compId}` }, (payload) => {
      const e = payload.new as FeedEvent; const cat = CATEGORY[e.kind];
      if (cat && (p.current?.[cat] ?? true)) toast("ok", feedText(e));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [compId, toast]);
}
