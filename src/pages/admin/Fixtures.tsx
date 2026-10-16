import { useState } from "react";
import { useComp } from "@/lib/comp";
import { useAction, useFixtures, useResults, useTeams, teamById } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { TeamBadge } from "@/components/TeamBadge";
import { Banner, Button, Confirm, Empty, ErrorState, Loading, Modal, Pill, inputCls } from "@/components/ui";
import type { Fixture } from "@/types";

function SchedRow({ f, onSave, busy }: { f: Fixture; onSave: (iso: string | null) => void; busy: boolean }) {
  const [v, setV] = useState(toLocalInput(f.scheduled_at));
  return (<div className="flex flex-wrap items-start gap-2"><input type="datetime-local" aria-label="Match date and time (South African time)" className={`${inputCls} max-w-60`} value={v} onChange={(e) => setV(e.target.value)} />
    <Button variant="ghost" busy={busy} reason={v === toLocalInput(f.scheduled_at) ? "No change to save." : !v ? "Pick a date and time." : undefined} onClick={() => onSave(fromLocalInput(v))}>Save time</Button></div>);
}
export default function Fixtures() {
  const { comp } = useComp(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const fx = useFixtures(cid); const teams = useTeams(cid); const results = useResults(cid);
  const [gen, setGen] = useState(false); const [regen, setRegen] = useState(false); const [wo, setWo] = useState<Fixture | null>(null); const [winner, setWinner] = useState("");
  if (!comp) return <Empty title="No competition yet" />;
  if (fx.isLoading || teams.isLoading) return <Loading />;
  if (fx.error) return <ErrorState error={fx.error} retry={() => fx.refetch()} />;
  const list = fx.data ?? []; const activeTeams = (teams.data ?? []).filter((t) => t.status === "active");
  const n = activeTeams.length; const matches = (n * (n - 1)) / 2; const rounds = n % 2 === 0 ? n - 1 : n;
  const rounds_list = [...new Set(list.map((f) => f.round))].sort((a, b) => a - b);
  const resFor = (id: string) => results.data?.find((r) => r.fixture_id === id);
  return (
    <div className="space-y-6">
      <section className="space-y-3"><h2 className="text-2xl font-black">Round robin</h2>
        <p className="text-sand/90">Every tribe plays every other tribe once. With {n} tribes that's {matches} matches over {rounds} rounds.</p>
        <Button busy={busy === "gen"} reason={list.length > 0 ? "Fixtures already exist. Regenerating while keeping approved scores arrives in Stage 2." : n < 2 ? "You need at least 2 active tribes." : undefined} onClick={() => setGen(true)}>Generate fixtures</Button>
        <div className="space-y-1 pt-1"><Button variant="ghost" reason={list.length === 0 ? "Generate fixtures first." : undefined} onClick={() => setRegen(true)}>Regenerate unplayed fixtures</Button>
          <p className="text-xs text-sand/70">Use this after adding or withdrawing a tribe. Played matches and approved scores are never touched.</p></div>
        <div className="flex flex-wrap items-center gap-3 pt-1"><Pill tone={comp.show_fixtures ? "ok" : "warn"}>{comp.show_fixtures ? "Visible to players" : "Hidden from players"}</Pill>
          <Button variant="ghost" busy={busy === "vis"} onClick={() => run("vis", () => supabase.from("competitions").update({ show_fixtures: !comp.show_fixtures }).eq("id", comp.id), comp.show_fixtures ? "Fixtures hidden." : "Fixtures published to players.")}>{comp.show_fixtures ? "Hide from players" : "Publish to players"}</Button></div>
      </section>
      {list.length === 0 ? <Empty title="No fixtures yet">Create the tribes, then generate fixtures.</Empty> : rounds_list.map((r) => (
        <section key={r} className="space-y-2"><h3 className="text-2xl font-black">Round {r}</h3>
          {list.filter((f) => f.round === r).map((f) => { const res = resFor(f.id); return (
            <div key={f.id} className="space-y-3 rounded-md bg-white/[.05] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="flex flex-wrap items-center gap-3"><TeamBadge team={teamById(teams.data, f.team_a)} size="sm" /><span className="text-sand/60">v</span><TeamBadge team={teamById(teams.data, f.team_b)} size="sm" /></span>
                <Pill tone={f.status === "played" ? "ok" : f.status === "walkover" ? "warn" : f.status === "cancelled" ? "bad" : "plain"}>{f.status}</Pill></div>
              {f.status === "scheduled" && <><SchedRow f={f} busy={busy === "t" + f.id} onSave={(iso) => run("t" + f.id, () => supabase.from("fixtures").update({ scheduled_at: iso }).eq("id", f.id), "Match time saved.")} />
                <Button variant="ghost" reason={res?.status === "approved" ? "Already has an approved result." : undefined} onClick={() => { setWo(f); setWinner(""); }}>Record a walkover</Button></>}
            </div>); })}</section>))}
      <Confirm open={gen} title="Generate fixtures?" body={<>This creates {matches} matches over {rounds} rounds for the {n} active tribes. You can't regenerate them in Stage 1, so check the tribes first.</>} confirmLabel="Generate fixtures" busy={busy === "gen"}
        onClose={() => setGen(false)} onConfirm={async () => { if (await run("gen", () => supabase.rpc("generate_fixtures", { p_competition: comp.id }), "Fixtures generated.")) setGen(false); }} />
      <Confirm open={regen} title="Regenerate the unplayed fixtures?" busy={busy === "regen"} confirmLabel="Regenerate" danger onClose={() => setRegen(false)}
        body={<><p><b>{list.filter((x) => x.status === "played" || x.status === "walkover").length} played matches</b> and their approved scores stay exactly as they are.</p><p className="mt-2"><b>{list.filter((x) => x.status === "scheduled" || x.status === "cancelled").length} unplayed matches</b> are rebuilt, including any times you set and any pending results or line-ups on them. Missing pairings are added.</p></>}
        onConfirm={async () => { if (await run("regen", () => supabase.rpc("regenerate_fixtures", { p_competition: comp.id, p_confirm: true }), "Unplayed fixtures regenerated.")) setRegen(false); }} />
      <Modal open={!!wo} onClose={() => setWo(null)} title="Record a walkover">
        <Banner tone="warn">The winner gets 6-0, 6-0, 6-0, labelled Walkover, and the result counts straight away. This can't be undone here.</Banner>
        <fieldset className="mt-4 space-y-2"><legend className="mb-1 text-sm font-medium text-sand">Who wins?</legend>
          {wo && [wo.team_a, wo.team_b].map((id) => <label key={id} className="flex min-h-11 items-center gap-2"><input type="radio" name="wo" className="h-5 w-5 accent-fern" checked={winner === id} onChange={() => setWinner(id)} />{teamById(teams.data, id)?.name}</label>)}</fieldset>
        <div className="mt-5 flex justify-end gap-2"><Button variant="quiet" onClick={() => setWo(null)}>Cancel</Button><Button busy={busy === "wo"} reason={!winner ? "Choose the winner." : undefined} onClick={async () => { if (await run("wo", () => supabase.rpc("record_walkover", { p_fixture: wo!.id, p_winner: winner }), "Walkover recorded.")) setWo(null); }}>Record walkover</Button></div>
      </Modal>
    </div>
  );
}
