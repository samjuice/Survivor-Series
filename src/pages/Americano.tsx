import { useState } from "react";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useAmericanoEvents, useAmericanoMatches, useAmericanoStandings, useTeams, teamById } from "@/lib/data";
import { tribeColor } from "@/components/Emblems";
import { Empty, ErrorState, Footnote, Loading, PageTitle, Pill, Stripe } from "@/components/ui";

export default function AmericanoPage() {
  const { comp } = useComp(); const me = useMe(); const cid = comp?.id;
  const events = useAmericanoEvents(cid); const matches = useAmericanoMatches(cid); const stand = useAmericanoStandings(cid); const teams = useTeams(cid);
  const [pick, setPick] = useState<string | null>(null);
  if (!comp) return <Empty title="No competition yet" />;
  if (events.isLoading || matches.isLoading || stand.isLoading) return <Loading />;
  if (events.error) return <ErrorState error={events.error} retry={() => events.refetch()} />;
  const evs = events.data ?? [];
  if (evs.length === 0) return <><PageTitle>Americano</PageTitle><Empty title="No Americano yet">The opening and closing Americanos appear here once the organisers publish them.</Empty></>;
  const ev = evs.find((e) => e.id === pick) ?? evs[0];
  const rows = (stand.data ?? []).filter((r) => r.event_id === ev.id); const ms = (matches.data ?? []).filter((m) => m.event_id === ev.id);
  const name = (id: string) => rows.find((r) => r.registration_id === id)?.name ?? "Player";
  const rounds = [...new Set(ms.map((m) => m.round))].sort((a, b) => a - b); const mine = me.reg?.id;
  return (
    <div>
      <PageTitle sub={ev.kind === "finale" ? "Mixed tribes. Everyone plays with everyone." : "Individual points. Nothing here changes the tribal table."}>Americano</PageTitle>
      {evs.length > 1 && <div className="mb-4 flex gap-2">{evs.map((e) => <button key={e.id} onClick={() => setPick(e.id)} aria-pressed={e.id === ev.id} className={`rounded-full px-4 py-2.5 text-sm ${e.id === ev.id ? "bg-parchment font-semibold text-night" : "bg-white/10 text-sand"}`}>{e.kind === "finale" ? "Closing" : "Opening"}</button>)}</div>}
      <div className="mb-4 flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black">{ev.name}</h2><Pill tone={ev.status === "completed" ? "gold" : "ok"}>{ev.status === "completed" ? "Complete" : "Live"}</Pill><span className="text-sm text-sand/80">Each match is played to {ev.points_per_match} points in total.</span></div>

      <h3 className="mb-2 text-xl font-bold">Standings</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[26rem] border-separate border-spacing-y-1.5 text-left">
        <caption className="sr-only">Individual Americano standings by points scored</caption>
        <thead className="text-xs text-sand/70"><tr><th className="w-10 pl-3 font-normal">#</th><th className="font-normal">Player</th><th className="font-normal">P</th><th className="font-normal">W</th><th className="font-normal">+/-</th><th className="pr-3 text-right font-normal">Pts</th></tr></thead>
        <tbody>{rows.map((r) => { const t = r.team_id ? teamById(teams.data, r.team_id) : undefined; return (
          <tr key={r.registration_id} className={r.registration_id === mine ? "bg-white/10" : "bg-white/[.04]"}>
            <td className="rounded-l-md py-2.5 pl-3"><span className="num font-display text-xl font-black">{r.rank}</span></td>
            <td className="py-2.5"><span className="flex items-center gap-2.5">{t ? <Stripe color={tribeColor(t.color)} /> : <span className="w-1.5" />}<span className="font-medium">{r.name}</span></span></td>
            <td className="num py-2.5">{r.played}</td><td className="num py-2.5">{r.wins}</td><td className="num py-2.5">{r.diff > 0 ? "+" : ""}{r.diff}</td>
            <td className="num rounded-r-md py-2.5 pr-3 text-right font-display text-xl font-black">{r.pts_for}</td></tr>); })}</tbody>
      </table></div>

      <h3 className="mb-2 mt-8 text-xl font-bold">Schedule</h3>
      {rounds.map((r) => (
        <section key={r} className="mb-5"><h4 className="mb-1.5 font-display text-lg font-bold">Round {r}</h4>
          <ul className="space-y-1.5">{ms.filter((m) => m.round === r).map((m) => { const has = mine && [m.a1, m.a2, m.b1, m.b2].includes(mine); return (
            <li key={m.id} className={`rounded-md p-3 text-sm ${has ? "bg-white/10" : "bg-white/[.04]"}`}>
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-sand/70">Court {m.court}</span>{has && <Pill tone="ok">Your match</Pill>}</div>
              <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><span>{name(m.a1)} and {name(m.a2)}</span><span className="num font-display text-lg font-black">{m.status === "played" ? `${m.score_a} - ${m.score_b}` : "v"}</span><span className="text-right">{name(m.b1)} and {name(m.b2)}</span></div>
            </li>); })}</ul></section>))}
      <Footnote title="How the Americano works"><p>Partners change every round. Each player scores the points their side wins, so a 14-10 win gives each winner 14 points.</p><p>Standings are by points scored, then point difference, then wins. Results are entered by an admin.</p></Footnote>
    </div>
  );
}
