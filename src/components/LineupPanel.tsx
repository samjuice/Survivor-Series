import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAction, useLineups, useRoster } from "@/lib/data";
import { Button, Pill, inputCls } from "./ui";
import type { Fixture, Lineup, RosterRow, Team } from "@/types";

function Side({ team, fixture, lineup, roster, canEdit, isAdmin }: { team: Team; fixture: Fixture; lineup?: Lineup; roster: RosterRow[]; canEdit: boolean; isAdmin: boolean }) {
  const { run, busy } = useAction(fixture.competition_id);
  const [r1, setR1] = useState(lineup?.reg1 ?? ""); const [r2, setR2] = useState(lineup?.reg2 ?? "");
  const name = (id: string) => roster.find((r) => r.registration_id === id)?.name ?? "Player";
  const members = roster.filter((r) => r.team_id === team.id);
  const reason = !r1 || !r2 ? "Pick two players." : r1 === r2 ? "Pick two different players." : undefined;
  return (
    <div className="rounded-md bg-white/[.05] p-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-bold">{team.name}</h3>{lineup?.locked && <Pill tone="warn">Locked</Pill>}</div>
      {lineup ? <p className="mt-1">{name(lineup.reg1)} and {name(lineup.reg2)}</p>
        : <p className="mt-1 text-sm text-sand/80">{canEdit ? "No players picked yet." : "Revealed once locked, or after the match."}</p>}
      {canEdit && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {[[r1, setR1, "First player"], [r2, setR2, "Second player"]].map(([v, set, label], i) => (
              <select key={i} aria-label={`${label} for ${team.name}`} className={`${inputCls} max-w-52`} value={v as string} onChange={(e) => (set as (x: string) => void)(e.target.value)}>
                <option value="">{label as string}</option>{members.map((m) => <option key={m.registration_id} value={m.registration_id}>{m.name}</option>)}</select>))}
          </div>
          <Button busy={busy === "lineup" + team.id} reason={reason} onClick={() => run("lineup" + team.id, () => supabase.rpc("set_lineup", { p_fixture: fixture.id, p_team: team.id, p_reg1: r1, p_reg2: r2 }), "Representatives saved.")}>{lineup ? "Change representatives" : "Save representatives"}</Button>
        </div>)}
      {!canEdit && lineup?.locked && !isAdmin && <p className="mt-2 text-xs text-sand/70">Locked by an admin.</p>}
    </div>
  );
}
export default function LineupPanel({ fixture, a, b, myTeamId, isCaptain, isAdmin, phaseOk }: { fixture: Fixture; a?: Team; b?: Team; myTeamId?: string; isCaptain: boolean; isAdmin: boolean; phaseOk: boolean }) {
  const lineups = useLineups(fixture.competition_id); const roster = useRoster(fixture.competition_id); const { run, busy } = useAction(fixture.competition_id);
  const mine = (t: Team) => lineups.data?.find((l) => l.fixture_id === fixture.id && l.team_id === t.id);
  const open = fixture.status === "scheduled" && phaseOk;
  const any = [a, b].some((t) => t && mine(t));
  return (
    <section className="mt-6 space-y-3">
      <h2 className="text-2xl font-black">Who plays</h2>
      <p className="text-sm text-sand/80">Each captain picks two players to represent their tribe in this match.</p>
      {[a, b].map((t) => t && (
        <Side key={t.id + (mine(t)?.updated_at ?? "")} team={t} fixture={fixture} lineup={mine(t)} roster={roster.data ?? []} isAdmin={isAdmin}
          canEdit={open && (isAdmin || (isCaptain && myTeamId === t.id)) && (isAdmin || !mine(t)?.locked)} />))}
      {isAdmin && fixture.status === "scheduled" && any && (
        <Button variant="ghost" busy={busy === "lock"} onClick={() => run("lock", () => supabase.rpc("lock_lineups", { p_fixture: fixture.id, p_locked: !(lineups.data ?? []).some((l) => l.fixture_id === fixture.id && l.locked) }), "Line-up lock changed.")}>
          {(lineups.data ?? []).some((l) => l.fixture_id === fixture.id && l.locked) ? "Unlock line-ups" : "Lock line-ups"}</Button>)}
    </section>
  );
}
