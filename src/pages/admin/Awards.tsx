import { useMemo, useState } from "react";
import { useComp } from "@/lib/comp";
import { regName, useAction, useAwards, useProfiles, useRegistrations, useTeams, useWinners } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { Banner, Button, Confirm, Empty, ErrorState, Field, Loading, Pill, inputCls } from "@/components/ui";
import type { Award } from "@/types";

function AwardCard({ a, cid, options, winner, onDelete }: { a: Award; cid: string; options: { id: string; name: string }[]; winner?: { name: string | null; published: boolean }; onDelete: () => void }) {
  const { run, busy } = useAction(cid); const [pick, setPick] = useState(""); const [tally, setTally] = useState<{ nominee_id: string; name: string; votes: number }[] | null>(null);
  return (
    <li className="space-y-3 rounded-md bg-white/[.05] p-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold">{a.title}</h3><Pill>{a.nominee_kind === "tribe" ? "Tribe award" : "Player award"}</Pill><Pill tone={a.voting_open ? "ok" : "plain"}>{a.voting_open ? "Voting open" : "Voting closed"}</Pill>{winner && <Pill tone={winner.published ? "gold" : "warn"}>{winner.published ? "Published" : "Winner chosen, not published"}</Pill>}</div>
      {a.description && <p className="text-sm text-sand/90">{a.description}</p>}
      {winner && <p>Winner: <b>{winner.name}</b></p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" busy={busy === "v" + a.id} onClick={() => run("v" + a.id, () => supabase.from("awards").update({ voting_open: !a.voting_open }).eq("id", a.id), a.voting_open ? "Voting closed." : "Voting opened. Players can vote now.")}>{a.voting_open ? "Close voting" : "Open voting"}</Button>
        <Button variant="ghost" busy={busy === "t" + a.id} onClick={async () => { const { data, error } = await supabase.rpc("award_tally", { p_award: a.id }); if (!error) setTally(data as { nominee_id: string; name: string; votes: number }[]); }}>Show vote totals</Button>
        <Button variant="quiet" onClick={onDelete}>Delete</Button></div>
      {tally && (tally.length === 0 ? <p className="text-sm text-sand/80">No votes yet.</p> : <ol className="space-y-1 text-sm">{tally.map((t) => <li key={t.nominee_id} className="flex items-center justify-between rounded bg-white/[.04] px-3 py-1.5"><span>{t.name}</span><span className="num font-bold">{t.votes} {t.votes === 1 ? "vote" : "votes"}</span></li>)}<li className="text-xs text-sand/70">Totals are anonymous. You can't see who voted for whom.</li></ol>)}
      <div className="flex flex-wrap items-start gap-2 border-t border-white/10 pt-3">
        <select aria-label={`Winner of ${a.title}`} className={`${inputCls} max-w-64`} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose the winner...</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <Button busy={busy === "w" + a.id} reason={!pick ? "Choose a winner first." : undefined} onClick={() => run("w" + a.id, () => supabase.rpc("set_award_winner", { p_award: a.id, p_winner: pick }), "Winner chosen. Not public until you publish.")}>{winner ? "Change winner" : "Set winner"}</Button></div>
    </li>
  );
}
export default function AdminAwards() {
  const { comp } = useComp(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const awards = useAwards(cid); const winners = useWinners(cid); const regs = useRegistrations(cid); const teams = useTeams(cid);
  const ids = useMemo(() => [...new Set((regs.data ?? []).map((r) => r.user_id).filter((x): x is string => !!x))], [regs.data]);
  const profiles = useProfiles(cid, ids);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [kind, setKind] = useState<"player" | "tribe">("player"); const [del, setDel] = useState<Award | null>(null);
  if (!comp) return <Empty title="No competition yet" />;
  if (awards.isLoading || regs.isLoading) return <Loading />;
  if (awards.error) return <ErrorState error={awards.error} retry={() => awards.refetch()} />;
  const players = (regs.data ?? []).filter((r) => r.status === "approved").map((r) => ({ id: r.id, name: regName(r, profiles.data).replace(" (placeholder)", "") })).sort((a, b) => a.name.localeCompare(b.name));
  const tribeOpts = (teams.data ?? []).map((t) => ({ id: t.id, name: t.name }));
  const chosen = (winners.data ?? []).length; const published = (winners.data ?? []).filter((w) => w.published).length;
  return (
    <div className="space-y-6">
      <Banner tone="info">Awards and voting never change tribal points or the table. Votes are secret. Winners stay hidden until you publish.</Banner>
      <form className="space-y-3 rounded-md bg-white/[.04] p-4" onSubmit={(e) => { e.preventDefault(); run("new", () => supabase.from("awards").insert({ competition_id: comp.id, title: title.trim(), description: desc.trim(), nominee_kind: kind, sort: (awards.data ?? []).length + 1 }), "Award created.").then((ok) => { if (ok) { setTitle(""); setDesc(""); } }); }}>
        <h2 className="text-2xl font-black">New award</h2>
        <Field label="Title">{(id) => <input id={id} className={inputCls} placeholder="Player of the series" value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Description (optional)">{(id) => <input id={id} className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
        <Field label="Goes to">{(id) => <select id={id} className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as "player" | "tribe")}><option value="player">A player</option><option value="tribe">A tribe</option></select>}</Field>
        <Button type="submit" busy={busy === "new"} reason={!title.trim() ? "Give the award a title." : undefined}>Create award</Button>
      </form>
      {(awards.data ?? []).length === 0 ? <Empty title="No awards yet">Create the first one above, for example Player of the series.</Empty> : (
        <ul className="space-y-3">{awards.data!.map((a) => { const w = winners.data?.find((x) => x.award_id === a.id); return <AwardCard key={a.id} a={a} cid={comp.id} options={a.nominee_kind === "tribe" ? tribeOpts : players} winner={w ? { name: w.winner_name, published: w.published } : undefined} onDelete={() => setDel(a)} />; })}</ul>)}
      <section className="space-y-2"><h2 className="text-2xl font-black">Announce the winners</h2>
        <p className="text-sm text-sand/90">{chosen} of {(awards.data ?? []).length} awards have a winner. Publishing closes voting and shows every chosen winner to players.</p>
        <div className="flex flex-wrap gap-2"><Button busy={busy === "pub"} reason={chosen === 0 ? "Choose at least one winner first." : undefined} onClick={() => run("pub", () => supabase.rpc("publish_awards", { p_competition: comp.id, p_publish: true }), "Winners published.")}>Publish winners</Button>
          <Button variant="ghost" busy={busy === "unpub"} reason={published === 0 ? "Nothing is published." : undefined} onClick={() => run("unpub", () => supabase.rpc("publish_awards", { p_competition: comp.id, p_publish: false }), "Winners hidden again.")}>Hide winners</Button></div></section>
      <Confirm open={!!del} title={`Delete "${del?.title}"?`} body="Its votes and winner are deleted too." confirmLabel="Delete award" danger busy={busy === "del"} onClose={() => setDel(null)} onConfirm={async () => { if (await run("del", () => supabase.from("awards").delete().eq("id", del!.id), "Award deleted.")) setDel(null); }} />
    </div>
  );
}
