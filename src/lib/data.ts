import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useToast } from "@/components/ui";
import type { Announcement, AdminUser, Appearance, AmericanoEvent, AmericanoMatch, AmericanoRow, AuditRow, Award, AwardWinner, FeedEvent, Fixture, Lineup, MatchResult, Nominee, Prefs, Registration, RosterRow, StandingRow, Team, TeamMember, Profile } from "@/types";

// Every competition-scoped query lives under ["c", competitionId, ...] so realtime can refresh them all at once.
function useC<T>(cid: string | undefined, name: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, enabled = true) {
  return useQuery({
    queryKey: ["c", cid, name], enabled: !!cid && enabled,
    queryFn: async () => { const { data, error } = await fn(); if (error) throw new Error(error.message); return (data ?? []) as T; },
  });
}
export const useTeams = (cid?: string) => useC<Team[]>(cid, "teams", () => supabase.from("teams").select("*").eq("competition_id", cid!).order("name"));
export const useFixtures = (cid?: string) => useC<Fixture[]>(cid, "fixtures", () => supabase.from("fixtures").select("*").eq("competition_id", cid!).order("round").order("scheduled_at", { nullsFirst: false }));
export const useResults = (cid?: string) => useC<MatchResult[]>(cid, "results", () => supabase.from("results").select("*, result_sets(*)").eq("competition_id", cid!).order("created_at", { ascending: false }));
export const useStandings = (cid?: string) => useC<StandingRow[]>(cid, "standings", () => supabase.from("standings").select("*").eq("competition_id", cid!).order("rank").order("name"));
export const useRoster = (cid?: string) => useC<RosterRow[]>(cid, "roster", () => supabase.from("roster").select("*").eq("competition_id", cid!));
export const useAnnouncements = (cid?: string) => useC<Announcement[]>(cid, "announcements", () => supabase.from("announcements").select("*").eq("competition_id", cid!).order("pinned", { ascending: false }).order("created_at", { ascending: false }));
export const useFeed = (cid?: string) => useC<FeedEvent[]>(cid, "feed", () => supabase.from("feed_events").select("*").eq("competition_id", cid!).order("id", { ascending: false }).limit(30));
export const useMyRegistration = (cid?: string, uid?: string) =>
  useQuery({
    queryKey: ["c", cid, "myreg", uid], enabled: !!cid && !!uid,
    queryFn: async () => { const { data, error } = await supabase.from("registrations").select("*").eq("competition_id", cid!).eq("user_id", uid!).maybeSingle(); if (error) throw new Error(error.message); return (data as Registration | null) ?? null; },
  });
export const useMyMembership = (regId?: string) =>
  useQuery({
    queryKey: ["c", "membership", regId], enabled: !!regId,
    queryFn: async () => { const { data, error } = await supabase.from("team_members").select("*").eq("registration_id", regId!).is("left_at", null).maybeSingle(); if (error) throw new Error(error.message); return (data as TeamMember | null) ?? null; },
  });
export const usePaymentInfo = (cid?: string, enabled = true) =>
  useQuery({
    queryKey: ["c", cid, "payinfo"], enabled: !!cid && enabled,
    queryFn: async () => { const { data, error } = await supabase.from("payment_info").select("instructions").eq("competition_id", cid!).maybeSingle(); if (error) throw new Error(error.message); return (data?.instructions as string | undefined) ?? ""; },
  });
export const usePrizePool = (cid?: string, enabled = true) =>
  useQuery({
    queryKey: ["c", cid, "prize"], enabled: !!cid && enabled,
    queryFn: async () => { const { data, error } = await supabase.rpc("prize_pool_cents", { p_competition: cid }); if (error) throw new Error(error.message); return data as number | null; },
  });
export const useRegistrations = (cid?: string, enabled = true) => useC<Registration[]>(cid, "regs", () => supabase.from("registrations").select("*").eq("competition_id", cid!).order("created_at"), enabled);
export const useMembers = (cid?: string, enabled = true) =>
  useC<TeamMember[]>(cid, "members", () => supabase.from("team_members").select("*, teams!inner(competition_id)").eq("teams.competition_id", cid!).order("joined_at"), enabled);
export const useProfiles = (cid: string | undefined, ids: string[], enabled = true) =>
  useQuery({
    queryKey: ["c", cid, "profiles", ids.join(",")], enabled: !!cid && enabled && ids.length > 0,
    queryFn: async () => { const { data, error } = await supabase.from("profiles").select("id, full_name, display_name, status").in("id", ids); if (error) throw new Error(error.message); return (data ?? []) as Profile[]; },
  });

export const useLineups = (cid?: string) => useC<Lineup[]>(cid, "lineups", () => supabase.from("lineups").select("*").eq("competition_id", cid!));
export const useAppearances = (cid?: string) => useC<Appearance[]>(cid, "appearances", () => supabase.from("player_appearances").select("*").eq("competition_id", cid!));
export const useAmericanoEvents = (cid?: string) => useC<AmericanoEvent[]>(cid, "amer-events", () => supabase.from("americano_events").select("*").eq("competition_id", cid!).order("kind"));
export const useAmericanoMatches = (cid?: string) => useC<AmericanoMatch[]>(cid, "amer-matches", () => supabase.from("americano_matches").select("*").eq("competition_id", cid!).order("round").order("court"));
export const useAmericanoStandings = (cid?: string) => useC<AmericanoRow[]>(cid, "amer-standings", () => supabase.from("americano_standings").select("*").eq("competition_id", cid!).order("rank").order("name"));
export const useAwards = (cid?: string) => useC<Award[]>(cid, "awards", () => supabase.from("awards").select("*").eq("competition_id", cid!).order("sort").order("created_at"));
export const useWinners = (cid?: string) => useC<AwardWinner[]>(cid, "winners", () => supabase.from("award_winners").select("*").eq("competition_id", cid!).order("sort"));
export const useNominees = (cid?: string) => useC<Nominee[]>(cid, "nominees", () => supabase.from("vote_nominees").select("*"));
export const useMyVotes = (cid?: string) => useC<{ award_id: string; nominee_id: string }[]>(cid, "myvotes", () => supabase.from("award_votes").select("award_id, nominee_id"));
export const useAudit = (cid?: string, limit = 50, enabled = true) => useC<AuditRow[]>(cid, "audit-" + limit, () => supabase.from("audit_log").select("*").eq("competition_id", cid!).order("id", { ascending: false }).limit(limit), enabled);
export const useCompAdmins = (cid?: string, enabled = true) => useC<{ user_id: string; full_name: string | null; email: string }[]>(cid, "admins", () => supabase.rpc("list_competition_admins", { p_competition: cid }), enabled);
export const useAdminUsers = (cid: string | undefined, all: boolean, enabled = true) =>
  useQuery({
    queryKey: ["c", cid, "users", all], enabled: enabled && (all || !!cid),
    queryFn: async () => { const { data, error } = await supabase.rpc("list_users", all ? {} : { p_competition: cid }); if (error) throw new Error(error.message); return (data ?? []) as AdminUser[]; },
  });
export const usePrefs = (uid?: string) =>
  useQuery({
    queryKey: ["prefs", uid], enabled: !!uid,
    queryFn: async () => { const { data, error } = await supabase.from("notification_prefs").select("results, fixtures, announcements, reveals").eq("user_id", uid!).maybeSingle(); if (error) throw new Error(error.message); return (data as Prefs | null) ?? { results: true, fixtures: true, announcements: true, reveals: true }; },
  });

export const regName = (r: Registration, profiles: Profile[] | undefined) => {
  if (r.placeholder_name && !r.user_id) return r.placeholder_name + " (placeholder)";
  const p = profiles?.find((x) => x.id === r.user_id);
  return p ? p.display_name || p.full_name : "Player";
};

/** Runs an action with a spinner flag and a toast for success or failure. */
export function useAction(cid?: string) {
  const toast = useToast(); const qc = useQueryClient(); const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, okText?: string) => {
    setBusy(key);
    try {
      const { error } = await fn();
      if (error) { toast("error", friendly(error.message)); return false; }
      if (okText) toast("ok", okText);
      await Promise.all([qc.invalidateQueries({ queryKey: cid ? ["c", cid] : ["c"] }), qc.invalidateQueries({ queryKey: ["competitions"] })]);
      return true;
    } finally { setBusy(null); }
  }, [cid, qc, toast]);
  return { run, busy };
}
export function friendly(msg: string) {
  if (/permission denied|row-level security/i.test(msg)) return "You don't have permission to do that.";
  if (/duplicate key|already exists/i.test(msg)) return "That already exists.";
  if (/violates foreign key/i.test(msg)) return "That is still in use, so it can't be removed.";
  return msg;
}
export const teamById = (teams: Team[] | undefined, id: string) => teams?.find((t) => t.id === id);
