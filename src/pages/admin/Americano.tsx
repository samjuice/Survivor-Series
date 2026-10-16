import { useMemo, useState } from "react";
import { useComp } from "@/lib/comp";
import { regName, useAction, useAmericanoEvents, useAmericanoMatches, useAmericanoStandings, useMembers, useProfiles, useRegistrations } from "@/lib/data";
import { generateAmericano } from "@/lib/americano";
import { supabase } from "@/lib/supabase";
import { Banner, Button, Confirm, Empty, ErrorState, Field, Loading, Pill, inputCls } from "@/components/ui";
import type { AmericanoEvent, AmericanoMatch } from "@/types";

export function ScoreRow({ m, names, ppm, live, onSave, busy }: { m: AmericanoMatch; names: (id: string) => string; ppm: number; live: boolean; onSave: (a: number, b: number) => void; busy: boolean }) {
  const [a, setA] = useState(m.score_a?.toString() ?? ""); const [b, setB] = useState(m.score_b?.toString() ?? "");
  const na = Number(a), nb = Number(b); const filled = a !== "" && b !== "";
  const bad = !filled ? "Enter both scores." : !Number.isInteger(na) || !Number.isInteger(nb) || na < 0 || nb < 0 ? "Whole numbers only." : na + nb !== ppm ? `The scores must add up to ${ppm}.` : !live ? "Make the Americano live to enter scores." : undefined;
  return (
    <li className="rounded-md bg-white/[.05] p-3 text-sm">
      <p className="text-xs text-sand/70">Court {m.court}</p>
      <div className="mt-1 grid grid-cols-[1fr_auto] gap-2"><div><p>{names(m.a1)} and {names(m.a2)}</p><p className="text-sand/70">against {names(m.b1)} and {names(m.b2)}</p></div>
        <div className="flex items-start gap-1.5">
          <input aria-label={`Court ${m.court} first pair score`} inputMode="numeric" className={`${inputCls} num w-16 text-center`} value={a} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 3); setA(v); if (v !== "" && Number(v) <= ppm) setB(String(ppm - Number(v))); }} />
          <input aria-label={`Court ${m.court} second pair score`} inputMode="numeric" className={`${inputCls} num w-16 text-center`} value={b} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 3); setB(v); if (v !== "" && Number(v) <= ppm) setA(String(ppm - Number(v))); }} /></div></div>
      <div className="mt-2 flex items-center gap-2"><Button variant="ghost" busy={busy} reason={bad} onClick={() => onSave(na, nb)}>{m.status === "played" ? "Update score" : "Save score"}</Button>{m.status === "played" && <Pill tone="ok">Scored</Pill>}</div>
    </li>
  );
}

export default function AdminAmericano() {
  const { comp } = useComp(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const events = useAmericanoEvents(cid); const matches = useAmericanoMatches(cid); const stand = useAmericanoStandings(cid);
  const regs = useRegistrations(cid); const members = useMembers(cid);
  const ids = useMemo(() => [...new Set((regs.data ?? []).map((r) => r.user_id).filter((x): x is string => !!x))], [regs.data]);
  const profiles = useProfiles(cid, ids);
  const [kind, setKind] = useState<"opening" | "finale">("opening");
  const [rounds, setRounds] = useState("5"); const [ppm, setPpm] = useState("24"); const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9)); const [name, setName] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof generateAmericano> | null>(null); const [genErr, setGenErr] = useState<string | null>(null);
  const [del, setDel] = useState<AmericanoEvent | null>(null);
  if (!comp) return <Empty title="No competition yet" />;
  if (events.isLoading || regs.isLoading || matches.isLoading) return <Loading />;
  const err = events.error ?? regs.error ?? matches.error; if (err) return <ErrorState error={err} />;
  const approved = (regs.data ?? []).filter((r) => r.status === "approved");
  const nm = (id: string) => { const r = regs.data?.find((x) => x.id === id); return r ? regName(r, profiles.data).replace(" (placeholder)", "") : "Player"; };
  const ev = events.data?.find((e) => e.kind === kind); const ms = (matches.data ?? []).filter((m) => m.event_id === ev?.id);
  const scored = ms.filter((m) => m.status === "played").length; const rows = (stand.data ?? []).filter((r) => r.event_id === ev?.id);
  const groups = kind === "finale" ? Object.fromEntries((members.data ?? []).filter((m) => !m.left_at).map((m) => [m.registration_id, m.team_id])) : undefined;
  const makeSchedule = () => { setGenErr(null); try { setPreview(generateAmericano({ players: approved.map((r) => r.id), rounds: Number(rounds), seed, groups })); } catch (e) { setPreview(null); setGenErr(e instanceof Error ? e.message : "Couldn't build a schedule."); } };
  const create = async () => {
    if (!preview) return;
    if (await run("create", () => supabase.rpc("create_americano", { p_competition: comp.id, p_kind: kind, p_name: name.trim() || (kind === "finale" ? "Closing Americano" : "Opening Americano"), p_points: Number(ppm), p_rounds: preview.rounds }), "Americano created as a draft. Players can't see it yet.")) setPreview(null);
  };
  const setStatus = (status: string, msg: string) => run("status", () => supabase.rpc("set_americano_status", { p_event: ev!.id, p_status: status }), msg);
  const roundsList = [...new Set(ms.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <div className="space-y-6">
      <div className="flex gap-2">{(["opening", "finale"] as const).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setPreview(null); }} className={`rounded-full px-4 py-2.5 text-sm ${kind === k ? "bg-parchment font-semibold text-night" : "bg-white/10 text-sand"}`}>{k === "opening" ? "Opening Americano" : "Closing Americano"}</button>)}</div>
      <p className="text-sm text-sand/80">Individual points only. Nothing here ever changes the tribal table.{kind === "finale" ? " The finale mixes tribes so partners come from different tribes where possible." : ""}</p>

      {ev ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-black">{ev.name}</h2><Pill tone={ev.status === "live" ? "ok" : ev.status === "completed" ? "gold" : "warn"}>{ev.status === "draft" ? "Draft (hidden)" : ev.status === "live" ? "Live" : "Complete"}</Pill><span className="text-sm text-sand/80">{scored} of {ms.length} matches scored, {ev.points_per_match} points each</span></div>
          <div className="flex flex-wrap gap-2">
            {ev.status === "draft" && <Button busy={busy === "status"} onClick={() => setStatus("live", "Live. Players can now see it.")}>Publish to players</Button>}
            {ev.status === "live" && <Button busy={busy === "status"} reason={scored < ms.length ? `${ms.length - scored} matches still need a score.` : undefined} onClick={() => setStatus("completed", "Americano completed.")}>Complete the Americano</Button>}
            {ev.status === "completed" && <Button variant="ghost" busy={busy === "status"} onClick={() => setStatus("live", "Reopened.")}>Reopen</Button>}
            {ev.status === "live" && scored === 0 && <Button variant="ghost" busy={busy === "status"} onClick={() => setStatus("draft", "Hidden from players again.")}>Back to draft</Button>}
            <Button variant="ghost" reason={scored > 0 ? "It has scores, so it can't be deleted." : undefined} onClick={() => setDel(ev)}>Delete</Button>
          </div>
          {rows.length > 0 && scored > 0 && <div><h3 className="mb-1 text-xl font-bold">Standings so far</h3><ol className="space-y-1">{rows.slice(0, 8).map((r) => <li key={r.registration_id} className="flex items-center justify-between rounded-md bg-white/[.04] px-3 py-2"><span><span className="num mr-3 font-display text-lg font-black">{r.rank}</span>{r.name}</span><span className="num font-display text-lg font-black">{r.pts_for}</span></li>)}</ol></div>}
          {roundsList.map((r) => <section key={r}><h3 className="mb-1.5 text-xl font-bold">Round {r}</h3><ul className="space-y-2">{ms.filter((m) => m.round === r).map((m) => <ScoreRow key={m.id + (m.score_a ?? "") + (m.score_b ?? "")} m={m} names={nm} ppm={ev.points_per_match} live={ev.status === "live"} busy={busy === m.id}
            onSave={(a, b) => run(m.id, () => supabase.rpc("score_americano_match", { p_match: m.id, p_a: a, p_b: b }), "Score saved.")} />)}</ul></section>)}
        </section>
      ) : <Banner tone="info">There's no {kind === "finale" ? "closing" : "opening"} Americano yet. Build one below.</Banner>}

      {(!ev || scored === 0) && (
        <section className="space-y-4 rounded-md bg-white/[.04] p-4"><h2 className="text-2xl font-black">{ev ? "Rebuild the schedule" : "Build the schedule"}</h2>
          <p className="text-sm text-sand/90">{approved.length} approved players, {Math.floor(approved.length / 4)} courts per round{approved.length % 4 ? `, ${approved.length % 4} sitting out each round in turn` : ""}.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Rounds">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={rounds} onChange={(e) => { setRounds(e.target.value); setPreview(null); }} />}</Field>
            <Field label="Points per match" hint="Both scores add up to this.">{(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" className={inputCls} value={ppm} onChange={(e) => setPpm(e.target.value)} />}</Field>
            <Field label="Name">{(id) => <input id={id} className={inputCls} placeholder={kind === "finale" ? "Closing Americano" : "Opening Americano"} value={name} onChange={(e) => setName(e.target.value)} />}</Field></div>
          {genErr && <Banner tone="error">{genErr}</Banner>}
          <div className="flex flex-wrap gap-2"><Button variant="ghost" reason={approved.length < 4 ? "You need at least 4 approved players." : !(Number(rounds) >= 1) ? "Choose at least 1 round." : undefined} onClick={makeSchedule}>{preview ? "Preview again" : "Preview schedule"}</Button>
            {preview && <Button variant="ghost" onClick={() => { setSeed(Math.floor(Math.random() * 1e9)); setPreview(null); }}>Shuffle differently</Button>}</div>
          {preview && (<div className="space-y-3">
            <Banner tone="ok" title="Preview">{preview.stats.minMatches === preview.stats.maxMatches ? `Everyone plays ${preview.stats.minMatches} matches.` : `Players play ${preview.stats.minMatches} to ${preview.stats.maxMatches} matches.`} {preview.stats.partnerRepeats === 0 ? "Nobody partners the same person twice." : `${preview.stats.partnerRepeats} repeat partnerships.`}{kind === "finale" ? ` ${preview.stats.sameGroupPartners === 0 ? "Every partnership mixes tribes." : `${preview.stats.sameGroupPartners} partnerships are within one tribe.`}` : ""}</Banner>
            {preview.rounds.map((rd, i) => <div key={i} className="text-sm"><p className="font-display font-bold">Round {i + 1}</p>{rd.map((m, c) => <p key={c} className="text-sand/90">Court {c + 1}: {nm(m[0])} and {nm(m[1])} against {nm(m[2])} and {nm(m[3])}</p>)}{preview.byes[i].length > 0 && <p className="text-sand/70">Sitting out: {preview.byes[i].map(nm).join(", ")}</p>}</div>)}
            <Button busy={busy === "create"} reason={!(Number(ppm) >= 4 && Number(ppm) <= 100) ? "Points per match must be between 4 and 100." : undefined} onClick={create}>{ev ? "Replace the schedule" : "Create as a draft"}</Button></div>)}
        </section>)}
      <Confirm open={!!del} title="Delete this Americano?" body="The schedule is removed. It has no scores." confirmLabel="Delete" danger busy={busy === "del"} onClose={() => setDel(null)} onConfirm={async () => { if (await run("del", () => supabase.rpc("delete_americano", { p_event: del!.id }), "Deleted.")) setDel(null); }} />
    </div>
  );
}
