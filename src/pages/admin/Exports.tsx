import { useMemo } from "react";
import { useComp } from "@/lib/comp";
import { regName, useAmericanoStandings, useFixtures, useMembers, useProfiles, useRegistrations, useResults, useStandings, useTeams, useWinners, teamById } from "@/lib/data";
import { downloadCsv } from "@/lib/csv";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { Banner, Button, Empty, Loading, useToast } from "@/components/ui";

type Row = (string | number | boolean | null)[];
export default function Exports() {
  const { comp } = useComp(); const cid = comp?.id; const toast = useToast();
  const regs = useRegistrations(cid); const teams = useTeams(cid); const members = useMembers(cid); const fx = useFixtures(cid); const res = useResults(cid);
  const stand = useStandings(cid); const amer = useAmericanoStandings(cid); const winners = useWinners(cid);
  const ids = useMemo(() => [...new Set((regs.data ?? []).map((r) => r.user_id).filter((x): x is string => !!x))], [regs.data]);
  const profiles = useProfiles(cid, ids);
  if (!comp) return <Empty title="No competition yet" />;
  if (regs.isLoading || teams.isLoading) return <Loading />;
  const slug = comp.slug; const nm = (id: string) => { const r = regs.data?.find((x) => x.id === id); return r ? regName(r, profiles.data).replace(" (placeholder)", "") : ""; };
  const tName = (id: string) => teamById(teams.data, id)?.name ?? "";
  const sets = (r?: { result_sets: { set_no: number; a_games: number; b_games: number }[] }) => (r ? [...r.result_sets].sort((a, b) => a.set_no - b.set_no).map((s) => `${s.a_games}-${s.b_games}`).join(" ") : "");
  const jobs: { key: string; label: string; hint: string; rows: () => Row[]; count: number }[] = [
    { key: "registrations", label: "Registrations and payments", hint: "Name, status, payment status, dates. For reconciling EFTs.", count: regs.data?.length ?? 0,
      rows: () => [["Name", "Registration", "Payment", "Registered", "Paid on"], ...(regs.data ?? []).map((r) => [regName(r, profiles.data), r.status, r.payment_status, r.created_at.slice(0, 10), r.paid_at ? r.paid_at.slice(0, 10) : ""])] },
    { key: "tribes", label: "Tribes and players", hint: "Who is on which tribe, with captains and history.", count: members.data?.length ?? 0,
      rows: () => [["Tribe", "Player", "Captain", "Joined", "Left"], ...(members.data ?? []).map((m) => [tName(m.team_id), nm(m.registration_id), m.is_captain, m.joined_at.slice(0, 10), m.left_at ? m.left_at.slice(0, 10) : ""])] },
    { key: "standings", label: "Tribal standings", hint: "Points, sets and games, as the table shows them.", count: stand.data?.length ?? 0,
      rows: () => [["Rank", "Tribe", "Played", "Won", "Lost", "Points", "Set diff", "Game diff", "Tied"], ...(stand.data ?? []).map((s) => [s.rank, s.name, s.played, s.won, s.lost, s.points, s.set_diff, s.game_diff, s.is_tied])] },
    { key: "fixtures", label: "Fixtures and results", hint: "Every match with time, status, sets and winner.", count: fx.data?.length ?? 0,
      rows: () => [["Round", "Tribe A", "Tribe B", "Time (SAST)", "Status", "Result", "Sets (A-B)", "Winner", "Walkover"], ...(fx.data ?? []).map((f) => { const r = res.data?.find((x) => x.fixture_id === f.id); return [f.round, tName(f.team_a), tName(f.team_b), f.scheduled_at ? fmtDateTime(f.scheduled_at) : "", f.status, r?.status ?? "", sets(r), r?.status === "approved" ? tName(r.winner_team) : "", r?.walkover ?? false]; })] },
    { key: "americano", label: "Americano standings", hint: "Individual points for the opening and closing Americanos.", count: amer.data?.length ?? 0,
      rows: () => [["Event", "Rank", "Player", "Played", "Wins", "Points for", "Points against", "Difference"], ...(amer.data ?? []).map((a) => [a.kind, a.rank, a.name, a.played, a.wins, a.pts_for, a.pts_against, a.diff])] },
    { key: "awards", label: "Award winners", hint: "Chosen winners, including whether they're published.", count: winners.data?.length ?? 0,
      rows: () => [["Award", "Goes to", "Winner", "Published"], ...(winners.data ?? []).map((w) => [w.title, w.nominee_kind, w.winner_name ?? "", w.published])] },
  ];
  const audit = async () => {
    const { data, error } = await supabase.from("audit_log").select("*").eq("competition_id", comp.id).order("id", { ascending: false }).limit(2000);
    if (error) { toast("error", error.message); return; }
    downloadCsv(`${slug}-audit-log.csv`, [["When", "Who", "Action", "What", "Details"], ...(data ?? []).map((r) => [r.created_at, r.actor_name ?? "System", r.action, r.entity, JSON.stringify(r.details)])]);
  };
  return (
    <div className="space-y-4">
      <Banner tone="info">Files download as CSV and open in Excel or Google Sheets. They contain personal data and payment status, so keep them private.</Banner>
      <ul className="space-y-2">{jobs.map((j) => (
        <li key={j.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white/[.05] p-3.5"><div><p className="font-semibold">{j.label}</p><p className="text-sm text-sand/80">{j.hint}</p></div>
          <Button variant="ghost" reason={j.count === 0 ? "Nothing to export yet." : undefined} onClick={() => downloadCsv(`${slug}-${j.key}.csv`, j.rows())}>Download ({j.count})</Button></li>))}
        <li className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white/[.05] p-3.5"><div><p className="font-semibold">Audit log</p><p className="text-sm text-sand/80">Up to the latest 2,000 changes, with who made them.</p></div><Button variant="ghost" onClick={audit}>Download</Button></li></ul>
    </div>
  );
}
