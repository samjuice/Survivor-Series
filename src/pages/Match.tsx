import { Link, useParams } from "react-router-dom";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useFixtures, useResults, useTeams, teamById } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { TeamBadge } from "@/components/TeamBadge";
import ScoreForm from "@/components/ScoreForm";
import LineupPanel from "@/components/LineupPanel";
import { Banner, Empty, ErrorState, Loading, Pill } from "@/components/ui";

export default function MatchPage() {
  const { id } = useParams(); const { comp, isAdmin } = useComp(); const me = useMe();
  const fx = useFixtures(comp?.id); const teams = useTeams(comp?.id); const results = useResults(comp?.id);
  if (fx.isLoading || teams.isLoading || results.isLoading) return <Loading />;
  if (fx.error) return <ErrorState error={fx.error} retry={() => fx.refetch()} />;
  const f = fx.data?.find((x) => x.id === id);
  if (!f || !comp) return <Empty title="Match not found" action={<Link to="/fixtures" className="underline">Back to matches</Link>}>It may have been removed, or it isn't visible to you yet.</Empty>;
  const a = teamById(teams.data, f.team_a); const b = teamById(teams.data, f.team_b);
  const res = results.data?.find((r) => r.fixture_id === f.id);
  const sets = res ? [...res.result_sets].sort((x, y) => x.set_no - y.set_no) : [];
  const myTeamIn = !!me.myTeam && (me.myTeam.id === f.team_a || me.myTeam.id === f.team_b);
  const canEnter = isAdmin || (me.isCaptain && myTeamIn);
  const phaseOk = isAdmin || ["opening", "tribal", "finale"].includes(comp.phase);
  const settled = f.status !== "scheduled";
  const editable = !settled && (!res || res.status !== "approved");
  const pendingOther = res?.status === "pending";

  return (
    <div className="pt-4">
      <Link to="/fixtures" className="inline-block min-h-11 py-2 text-sm underline">All matches</Link>
      <header className="mt-2 space-y-3"><p className="text-sand/80">Round {f.round}</p>
        <div className="space-y-2"><TeamBadge team={a} size="lg" /><p className="pl-2 text-sand/70">versus</p><TeamBadge team={b} size="lg" /></div>
        <p className="text-sand/90">{f.scheduled_at ? fmtDateTime(f.scheduled_at) : "Time to be confirmed"}</p></header>

      {(myTeamIn || isAdmin || f.status !== "scheduled" || comp.show_fixtures) && <LineupPanel fixture={f} a={a} b={b} myTeamId={me.myTeam?.id} isCaptain={me.isCaptain} isAdmin={isAdmin} phaseOk={phaseOk} />}

      {res && (
        <section className="mt-6 rounded-md bg-white/5 p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black">{res.status === "approved" ? `${teamById(teams.data, res.winner_team)?.name} won` : res.status === "pending" ? "Result awaiting approval" : "Result rejected"}</h2>{res.walkover && <Pill tone="warn">Walkover</Pill>}</div>
          <div className="num mt-3 grid grid-cols-[1fr_3rem_3rem] gap-y-1 text-xl">
            <span /><span className="truncate text-center text-xs text-sand/70">{a?.name}</span><span className="truncate text-center text-xs text-sand/70">{b?.name}</span>
            {sets.map((s) => <div key={s.set_no} className="contents"><span className="font-display text-base font-bold">Set {s.set_no}</span><span className={`text-center ${s.a_games > s.b_games ? "font-black" : "text-sand/70"}`}>{s.a_games}</span><span className={`text-center ${s.b_games > s.a_games ? "font-black" : "text-sand/70"}`}>{s.b_games}</span></div>)}</div>
          {res.status === "rejected" && <div className="mt-3"><Banner tone="error" title="An admin rejected this result">{res.reject_reason ?? "No reason was given."} Enter the correct score below.</Banner></div>}
          {pendingOther && isAdmin && <p className="mt-3 text-sm"><Link to="/admin/results" className="underline">Review it in the results queue</Link></p>}
        </section>)}

      {editable && (
        <section className="mt-6"><h2 className="mb-3 text-2xl font-black">{res?.status === "rejected" ? "Enter the score again" : pendingOther ? "Replace the pending score" : "Enter the score"}</h2>
          {!canEnter ? <Banner tone="info">Only the captains of these two tribes, or an admin, can enter the score. Ask your captain.</Banner>
            : !phaseOk ? <Banner tone="info">Scores can't be entered during this phase ({comp.phase === "registration" ? "registration" : comp.phase}). An admin opens tribal matches when it's time.</Banner>
            : <ScoreForm fixture={f} teamA={a} teamB={b} isAdmin={isAdmin} />}
        </section>)}
      {settled && !res && <p className="mt-6 text-sand/80">This match is {f.status}.</p>}
    </div>
  );
}
