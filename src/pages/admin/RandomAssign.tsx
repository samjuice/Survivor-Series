import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { explainFit, planTribes } from "@/lib/tribes";
import { TeamBadge } from "@/components/TeamBadge";
import { Banner, Button, Confirm } from "@/components/ui";
import type { Competition, Registration, Team, TeamMember } from "@/types";

type Run = (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>;
export default function RandomAssign({ comp, teams, regs, active, nameOf, run, busy }: { comp: Competition; teams: Team[]; regs: Registration[]; active: TeamMember[]; nameOf: (r: Registration) => string; run: Run; busy: string | null }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9)); const [again, setAgain] = useState(false); const [ask, setAsk] = useState(false);
  const next = (Math.imul(seed, 1103515245) + 12345) >>> 0;   // a fresh, different shuffle each time
  const live = teams.filter((t) => t.status === "active"); const approved = regs.filter((r) => r.status === "approved");
  const placed = new Set(active.map((m) => m.registration_id));
  const pool = (again ? approved : approved.filter((r) => !placed.has(r.id))).map((r) => r.id);
  const plan = planTribes(pool, live.map((t) => ({ id: t.id, existing: again ? 0 : active.filter((m) => m.team_id === t.id).length })), comp.team_size, seed);
  const fit = explainFit(approved.length, live.length, comp.team_size);
  const byId = new Map(regs.map((r) => [r.id, r])); const count = plan.assignments.reduce((n, a) => n + a.registrations.length, 0);
  const reason = live.length === 0 ? "Create at least one tribe first." : pool.length === 0 ? "Everyone approved is already on a tribe." : count === 0 ? "No tribe has room." : undefined;
  const apply = async () => {
    const ok = await run("assign", () => supabase.rpc("assign_tribes", { p_competition: comp.id, p_assignments: plan.assignments.filter((a) => a.registrations.length > 0), p_clear: again, p_confirm: again }), `${count} players placed on tribes.`);
    if (ok) { setAsk(false); setAgain(false); setSeed(next); }
  };
  return (
    <section className="space-y-3 rounded-md bg-white/[.04] p-4">
      <h2 className="text-2xl font-black">Random tribes</h2>
      <Banner tone={fit.fits ? "ok" : "warn"} title={fit.summary}>{!fit.fits && fit.options.length > 0 && <ul className="mt-1 list-disc pl-5">{fit.options.map((o) => <li key={o}>{o}</li>)}</ul>}</Banner>
      <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-fern" checked={again} onChange={(e) => setAgain(e.target.checked)} /><span><span className="block font-medium">Start again with everyone</span><span className="block text-sm text-sand/80">Takes all {approved.length} approved players off their tribes first (history is kept), then reshuffles.</span></span></label>
      {pool.length > 0 && live.length > 0 && <div><h3 className="mb-1.5 text-lg font-bold">Preview</h3>
        <ul className="space-y-2">{live.map((t) => { const a = plan.assignments.find((x) => x.team_id === t.id)!; const keep = again ? [] : active.filter((m) => m.team_id === t.id); return (
          <li key={t.id} className="rounded-md bg-white/[.05] p-3"><TeamBadge team={t} size="sm" />
            <p className="mt-1.5 text-sm text-sand/90">{[...keep.map((m) => byId.get(m.registration_id)).filter(Boolean).map((r) => `${nameOf(r!)} (stays)`), ...a.registrations.map((id) => nameOf(byId.get(id)!))].join(", ") || "Nobody"}</p></li>); })}</ul>
        {plan.unplaced.length > 0 && <div className="mt-2"><Banner tone="warn" title={`${plan.unplaced.length} ${plan.unplaced.length === 1 ? "player doesn't" : "players don't"} fit`}>{plan.unplaced.map((id) => nameOf(byId.get(id)!)).join(", ")}. Add a tribe or raise the tribe size.</Banner></div>}</div>}
      <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setSeed(next)} reason={reason}>Shuffle again</Button><Button busy={busy === "assign"} reason={reason} onClick={() => (again ? setAsk(true) : apply())}>Apply this assignment</Button></div>
      <p className="text-xs text-sand/70">Nothing changes until you apply. Tribes stay hidden from players until you reveal them.</p>
      <Confirm open={ask} title="Reshuffle everyone?" body={`All ${approved.length} approved players come off their current tribes and are placed again as shown. Existing captains are cleared. Results already approved are not changed.`} confirmLabel="Reshuffle everyone" danger busy={busy === "assign"} onClose={() => setAsk(false)} onConfirm={apply} />
    </section>
  );
}
