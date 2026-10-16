import { Link } from "react-router-dom";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useRoster, useTeams } from "@/lib/data";
import Topo from "@/components/Topo";
import Pennant from "@/components/Pennant";
import { Empty, Loading } from "@/components/ui";

// The tribe reveal: pennants drop one after another in the order the admin revealed them. Updates live.
export default function Reveal() {
  const { comp, isAdmin } = useComp(); const me = useMe();
  const teams = useTeams(comp?.id); const roster = useRoster(comp?.id);
  if (!comp) return <Empty title="No competition yet" />;
  if (teams.isLoading) return <Loading />;
  const shown = (teams.data ?? []).filter((t) => t.revealed).sort((a, b) => (a.revealed_at ?? "").localeCompare(b.revealed_at ?? ""));
  const mine = me.myTeam && me.myTeam.revealed ? me.myTeam : undefined;
  return (
    <div className="relative -mx-4 min-h-[85dvh] overflow-hidden bg-canopy px-5 pb-16 pt-10 safe-t md:mx-0 md:rounded-3xl">
      <Topo className="absolute inset-0 h-full w-full text-olive/25" />
      <div className="relative">
        <h1 className="text-5xl font-black leading-[.95]">The reveal</h1>
        {mine ? <p className="mt-3 text-xl">You are on <b className="font-display text-2xl">{mine.name}</b>.</p>
          : me.myTeam ? <p className="mt-3 text-sand/90">Your tribe is still hidden. Keep this screen open. It changes the moment it's revealed.</p>
          : <p className="mt-3 text-sand/90">Tribes appear here one by one as the organisers reveal them.</p>}
        {shown.length === 0 ? <div className="mt-10"><Empty title="Nothing revealed yet">{isAdmin ? "Reveal tribes from Admin, then Tribes." : "Stay here. This updates by itself."}</Empty></div> : (
          <ul className="mt-10 grid grid-cols-2 gap-x-3 gap-y-12 sm:grid-cols-3">
            {shown.map((t, i) => (
              <li key={t.id} className={`text-center ${t.id === me.myTeam?.id ? "rounded-2xl bg-white/10 pb-4 pt-2" : ""}`}>
                <Pennant name={t.name} color={t.color} emblem={t.emblem_key} delay={i * 0.9} />
                <ul className="mt-3 space-y-0.5 text-sm text-sand/90">
                  {(roster.data ?? []).filter((r) => r.team_id === t.id).sort((a, b) => Number(b.is_captain) - Number(a.is_captain)).map((r) => <li key={r.registration_id}>{r.name}{r.is_captain ? " (captain)" : ""}</li>)}
                </ul>
              </li>))}
          </ul>)}
        <p className="mt-12"><Link to="/tribes" className="inline-block min-h-11 py-2 underline">See all tribes</Link></p>
      </div>
    </div>
  );
}
