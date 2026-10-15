import { useState } from "react";
import { useComp } from "@/lib/comp";
import { useAction, useFixtures, useResults, useTeams, teamById } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { Button, Empty, ErrorState, Field, Loading, Modal, Pill, inputCls } from "@/components/ui";
import type { MatchResult } from "@/types";

export default function Results() {
  const { comp } = useComp(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const res = useResults(cid); const fx = useFixtures(cid); const teams = useTeams(cid);
  const [rej, setRej] = useState<MatchResult | null>(null); const [reason, setReason] = useState("");
  if (!comp) return <Empty title="No competition yet" />;
  if (res.isLoading || fx.isLoading || teams.isLoading) return <Loading />;
  if (res.error) return <ErrorState error={res.error} retry={() => res.refetch()} />;
  const all = res.data ?? []; const pending = all.filter((r) => r.status === "pending"); const rejected = all.filter((r) => r.status === "rejected");
  const line = (r: MatchResult) => { const f = fx.data?.find((x) => x.id === r.fixture_id); const sets = [...r.result_sets].sort((a, b) => a.set_no - b.set_no); return (
    <div><p className="font-display text-lg font-bold">{teamById(teams.data, f?.team_a ?? "")?.name} v {teamById(teams.data, f?.team_b ?? "")?.name}</p>
      <p className="num text-sand">{sets.map((s) => `${s.a_games}-${s.b_games}`).join("   ")}</p><p className="mt-1 text-xs text-sand/70">Sent {fmtDateTime(r.created_at)}. Winner: {teamById(teams.data, r.winner_team)?.name}</p></div>); };
  return (
    <div className="space-y-8">
      <section className="space-y-2"><h2 className="text-2xl font-black">Waiting for approval <span className="num text-sand/70">{pending.length}</span></h2>
        {pending.length === 0 ? <Empty title="Nothing waiting">New results from captains show up here.</Empty> : pending.map((r) => (
          <div key={r.id} className="rounded-md bg-white/[.05] p-3.5">{line(r)}<div className="mt-3 flex gap-2">
            <Button busy={busy === r.id + "a"} onClick={() => run(r.id + "a", () => supabase.rpc("review_result", { p_result: r.id, p_approve: true }), "Result approved.")}>Approve</Button>
            <Button variant="ghost" onClick={() => { setRej(r); setReason(""); }}>Reject</Button></div></div>))}</section>
      <section className="space-y-2"><h2 className="text-2xl font-black">Rejected <span className="num text-sand/70">{rejected.length}</span></h2>
        {rejected.length === 0 ? <p className="text-sand/80">No rejected results.</p> : rejected.map((r) => (
          <div key={r.id} className="rounded-md bg-white/[.05] p-3.5">{line(r)}{r.reject_reason && <p className="mt-1 text-sm text-sand/90">Reason: {r.reject_reason}</p>}
            <div className="mt-3"><Button variant="ghost" busy={busy === r.id + "d"} onClick={() => run(r.id + "d", () => supabase.from("results").delete().eq("id", r.id), "Rejected result deleted.")}>Delete rejected result</Button></div></div>))}</section>
      <p className="text-sm text-sand/80">{all.filter((r) => r.status === "approved").length} approved results count towards the table. <Pill>Approved results are final</Pill></p>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Reject this result">
        <Field label="Reason" hint="The captain sees this and can enter the score again.">{(id, d) => <textarea id={id} aria-describedby={d} rows={3} className={`${inputCls} py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-5 flex justify-end gap-2"><Button variant="quiet" onClick={() => setRej(null)}>Cancel</Button>
          <Button variant="danger" busy={busy === "rej"} reason={!reason.trim() ? "Add a reason so the captain knows what to fix." : undefined} onClick={async () => { if (await run("rej", () => supabase.rpc("review_result", { p_result: rej!.id, p_approve: false, p_reason: reason }), "Result rejected.")) setRej(null); }}>Reject result</Button></div>
      </Modal>
    </div>
  );
}
