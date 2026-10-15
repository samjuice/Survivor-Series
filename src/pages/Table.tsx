import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useStandings, useTeams, teamById } from "@/lib/data";
import { Emblem, tribeColor } from "@/components/Emblems";
import { Empty, ErrorState, Footnote, Loading, PageTitle, Pill, Stripe } from "@/components/ui";

export default function TablePage() {
  const { comp, isAdmin } = useComp(); const me = useMe();
  const st = useStandings(comp?.id); const teams = useTeams(comp?.id);
  if (!comp) return <Empty title="No competition yet" />;
  if (!comp.show_table && !isAdmin) return <><PageTitle>Table</PageTitle><Empty title="The table isn't open yet">It appears once tribal matches begin. Nothing to do here until then.</Empty></>;
  if (st.isLoading) return <Loading />;
  if (st.error) return <ErrorState error={st.error} retry={() => st.refetch()} />;
  const rows = st.data ?? [];
  return (
    <div>
      <PageTitle sub="Only approved results count.">Table</PageTitle>
      {!comp.show_table && <div className="mb-4"><Pill tone="warn">Hidden from players until you open it in Settings</Pill></div>}
      {rows.length === 0 ? <Empty title="No tribes yet">The table fills in once tribes exist and results are approved.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-separate border-spacing-y-1.5 text-left">
            <caption className="sr-only">Standings ordered by points, then set difference, then game difference</caption>
            <thead className="text-xs text-sand/70"><tr><th className="w-10 pl-3 font-normal">#</th><th className="font-normal">Tribe</th><th className="font-normal">P</th><th className="font-normal">W</th><th className="font-normal">L</th><th className="font-normal">Sets</th><th className="font-normal">Games</th><th className="pr-3 text-right font-normal">Pts</th></tr></thead>
            <tbody>
              {rows.map((r) => { const t = teamById(teams.data, r.team_id); const mine = me.myTeam?.id === r.team_id; return (
                <tr key={r.team_id} className={`${mine ? "bg-white/10" : "bg-white/[.04]"} ${r.status === "withdrawn" ? "opacity-60" : ""}`}>
                  <td className="rounded-l-md py-3 pl-3"><span className="num font-display text-2xl font-black">{r.rank}</span></td>
                  <td className="py-3"><span className="flex items-center gap-3"><Stripe color={tribeColor(t?.color)} /><Emblem k={t?.emblem_key} className="h-5 w-5 text-sand" /><span className="font-display text-lg font-bold">{r.name}</span>{r.status === "withdrawn" && <Pill tone="bad">Withdrawn</Pill>}</span>
                    {r.is_tied && r.played > 0 && <span className="ml-14 block text-xs text-sand/80">Level on points, sets and games with another tribe</span>}</td>
                  <td className="num py-3">{r.played}</td><td className="num py-3">{r.won}</td><td className="num py-3">{r.lost}</td>
                  <td className="num py-3">{r.set_diff > 0 ? "+" : ""}{r.set_diff}</td><td className="num py-3">{r.game_diff > 0 ? "+" : ""}{r.game_diff}</td>
                  <td className="num rounded-r-md py-3 pr-3 text-right font-display text-2xl font-black">{r.points}</td></tr>); })}
            </tbody>
          </table>
        </div>
      )}
      <Footnote title="How the table works">
        <p>A win is worth {comp.points_per_win} points. Ties are broken by set difference, then game difference.</p>
        <p>If tribes are still level after that, they share a position and the table says so.</p>
        <p>The Americano and awards never change tribal points.</p>
      </Footnote>
    </div>
  );
}
