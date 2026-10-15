import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useRoster, useTeams } from "@/lib/data";
import { tribeColor } from "@/components/Emblems";
import { TeamBadge } from "@/components/TeamBadge";
import { Empty, ErrorState, Loading, PageTitle, Pill, Stripe } from "@/components/ui";

export default function TribesPage() {
  const { comp, isAdmin } = useComp(); const me = useMe();
  const teams = useTeams(comp?.id); const roster = useRoster(comp?.id);
  if (!comp) return <Empty title="No competition yet" />;
  if (teams.isLoading || roster.isLoading) return <Loading />;
  if (teams.error) return <ErrorState error={teams.error} retry={() => teams.refetch()} />;
  const list = [...(teams.data ?? [])].sort((a, b) => (a.id === me.myTeam?.id ? -1 : b.id === me.myTeam?.id ? 1 : a.name.localeCompare(b.name)));
  return (
    <div>
      <PageTitle sub="Your tribe is first.">Tribes</PageTitle>
      {list.length === 0 ? <Empty title="The tribes are still secret">They appear here the moment they're revealed.</Empty> : (
        <ul className="space-y-4">
          {list.map((t) => { const members = (roster.data ?? []).filter((r) => r.team_id === t.id).sort((x, y) => Number(y.is_captain) - Number(x.is_captain) || x.name.localeCompare(y.name)); return (
            <li key={t.id} className="flex gap-3 rounded-md bg-white/[.05] p-4"><Stripe color={tribeColor(t.color)} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><TeamBadge team={t} size="md" />{t.id === me.myTeam?.id && <Pill tone="ok">Your tribe</Pill>}{t.status === "withdrawn" && <Pill tone="bad">Withdrawn</Pill>}{isAdmin && !t.revealed && <Pill tone="warn">Not revealed</Pill>}</div>
                <ul className="mt-3 space-y-1">{members.length === 0 ? <li className="text-sm text-sand/70">No players listed.</li> : members.map((m) => <li key={m.registration_id} className="flex items-center gap-2">{m.name}{m.is_captain && <Pill tone="gold">Captain</Pill>}</li>)}</ul></div></li>); })}
        </ul>)}
    </div>
  );
}
