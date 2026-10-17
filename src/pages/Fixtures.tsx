import { useState } from "react";
import { Link } from "react-router-dom";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useFixtures, useResults, useTeams, teamById } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { TeamBadge } from "@/components/TeamBadge";
import { Empty, ErrorState, Loading, PageTitle, Pill } from "@/components/ui";

export default function FixturesPage() {
  const { comp, isAdmin } = useComp(); const me = useMe();
  const fx = useFixtures(comp?.id); const teams = useTeams(comp?.id); const results = useResults(comp?.id);
  const [mine, setMine] = useState(false);
  if (!comp) return <Empty title="No competition yet" />;
  if (!comp.show_fixtures && !isAdmin) return <><PageTitle>Matches</PageTitle><Empty title="Fixtures aren't out yet">They appear here as soon as the organisers publish them.</Empty></>;
  if (fx.isLoading || teams.isLoading) return <Loading />;
  if (fx.error) return <ErrorState error={fx.error} retry={() => fx.refetch()} />;
  const all = (fx.data ?? []).filter((f) => !mine || (me.myTeam && (f.team_a === me.myTeam.id || f.team_b === me.myTeam.id)));
  const rounds = [...new Set(all.map((f) => f.round))].sort((a, b) => a - b);
  const resFor = (id: string) => results.data?.find((r) => r.fixture_id === id);
  return (
    <div>
      <PageTitle sub="Tap a match to see details or enter a score.">Matches</PageTitle>
      {me.myTeam && <label className="mb-4 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-5 w-5 accent-fern" />Only my tribe's matches</label>}
      {all.length === 0 ? <Empty title={mine ? "No matches for your tribe yet" : "No fixtures yet"}>{mine ? "Untick the box to see everyone's matches." : "An admin generates the fixtures once tribes are set."}</Empty> :
        rounds.map((r) => (
          <section key={r} className="mb-7"><h2 className="mb-2 text-2xl font-black">Round {r}</h2>
            <ul className="space-y-2">
              {all.filter((f) => f.round === r).map((f) => { const res = resFor(f.id); const a = teamById(teams.data, f.team_a); const b = teamById(teams.data, f.team_b); const approved = res?.status === "approved";
                const sets = approved ? [...res.result_sets].sort((x, y) => x.set_no - y.set_no) : [];
                return (
                  <li key={f.id}><Link to={`/match/${f.id}`} className="block rounded-md bg-white/[.05] p-3.5 hover:bg-white/10">
                    <div className="flex items-center justify-between gap-2"><TeamBadge team={a} size="sm" dim={approved && res.winner_team !== f.team_a} /><span className="text-xs text-sand/70">v</span><TeamBadge team={b} size="sm" dim={approved && res.winner_team !== f.team_b} /></div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-sand/90">
                      {approved ? <span className="num">{sets.map((s) => `${s.a_games}-${s.b_games}`).join("   ")}</span> : <span>{f.scheduled_at ? fmtDateTime(f.scheduled_at) : "Time to be confirmed"}</span>}
                      {res?.walkover && approved && <Pill tone="warn">Walkover</Pill>}
                      {res?.status === "pending" && <Pill tone="warn">Awaiting approval</Pill>}
                      {res?.status === "rejected" && <Pill tone="bad">Result rejected</Pill>}
                      {f.status === "cancelled" && <Pill tone="bad">Cancelled</Pill>}
                    </div></Link></li>); })}
            </ul></section>))}
    </div>
  );
}
