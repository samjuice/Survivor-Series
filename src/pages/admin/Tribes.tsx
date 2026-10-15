import { useMemo, useState } from "react";
import { useComp } from "@/lib/comp";
import { regName, useAction, useMembers, useProfiles, useRegistrations, useTeams } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { Emblem, EMBLEM_KEYS, TRIBE_COLORS, tribeColor } from "@/components/Emblems";
import { TeamBadge } from "@/components/TeamBadge";
import { Button, Confirm, Empty, ErrorState, Field, Loading, Modal, Pill, Stripe, inputCls } from "@/components/ui";
import type { Registration, Team, TeamMember } from "@/types";

export default function Tribes() {
  const { comp } = useComp(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const teams = useTeams(cid); const regs = useRegistrations(cid); const members = useMembers(cid);
  const ids = useMemo(() => [...new Set((regs.data ?? []).map((r) => r.user_id).filter((x): x is string => !!x))], [regs.data]);
  const profiles = useProfiles(cid, ids);
  const [name, setName] = useState(""); const [emb, setEmb] = useState(EMBLEM_KEYS[0]); const [col, setCol] = useState(TRIBE_COLORS[0]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [withdraw, setWithdraw] = useState<Team | null>(null); const [remove, setRemove] = useState<Team | null>(null); const [drop, setDrop] = useState<TeamMember | null>(null);
  const [replace, setReplace] = useState<{ team: Team; member: TeamMember } | null>(null); const [repWith, setRepWith] = useState(""); const [carry, setCarry] = useState(true);
  if (!comp) return <Empty title="No competition yet" />;
  if (teams.isLoading || regs.isLoading || members.isLoading) return <Loading />;
  const err = teams.error ?? regs.error ?? members.error; if (err) return <ErrorState error={err} />;
  const active = (members.data ?? []).filter((m) => !m.left_at);
  const placed = new Set(active.map((m) => m.registration_id));
  const free = (regs.data ?? []).filter((r) => r.status === "approved" && !placed.has(r.id));
  const nm = (r: Registration | undefined) => (r ? regName(r, profiles.data) : "Player");
  const regOf = (id: string) => regs.data?.find((r) => r.id === id);
  const create = async () => { if (await run("create", () => supabase.from("teams").insert({ competition_id: comp.id, name: name.trim(), emblem_key: emb, color: col }), "Tribe created.")) setName(""); };
  const makeCaptain = async (t: Team, m: TeamMember) => {
    const cur = active.find((x) => x.team_id === t.id && x.is_captain);
    if (cur && !(await run("cap0", () => supabase.from("team_members").update({ is_captain: false }).eq("id", cur.id)))) return;
    await run("cap", () => supabase.from("team_members").update({ is_captain: true }).eq("id", m.id), "Captain set.");
  };
  const doReplace = async () => {
    if (!replace) return; const oldReg = replace.member.registration_id;
    const ok = await run("rep", () => supabase.rpc("replace_team_player", { p_team: replace.team.id, p_old_registration: oldReg, p_new_registration: repWith }), "Player replaced. History is kept.");
    if (ok && carry) { await run("fee", () => supabase.from("registrations").update({ payment_status: "paid" }).eq("id", repWith)); const old = regOf(oldReg); if (old?.user_id === null || old?.payment_status === "paid") await run("old", () => supabase.from("registrations").update({ status: "withdrawn" }).eq("id", oldReg)); }
    if (ok) { setReplace(null); setRepWith(""); }
  };
  return (
    <div className="space-y-7">
      <form className="space-y-4 rounded-md bg-white/[.05] p-4" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <h2 className="text-2xl font-black">Create a tribe</h2>
        <Field label="Tribe name">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <fieldset><legend className="mb-1 text-sm font-medium text-sand">Emblem</legend><div className="flex flex-wrap gap-2">{EMBLEM_KEYS.map((k) => <button type="button" key={k} aria-label={k} aria-pressed={emb === k} onClick={() => setEmb(k)} className={`grid h-12 w-12 place-items-center rounded-md ${emb === k ? "bg-parchment text-night" : "bg-white/10 text-sand"}`}><Emblem k={k} className="h-7 w-7" /></button>)}</div></fieldset>
        <fieldset><legend className="mb-1 text-sm font-medium text-sand">Colour</legend><div className="flex flex-wrap gap-2">{TRIBE_COLORS.map((c) => <button type="button" key={c} aria-label={`Colour ${c}`} aria-pressed={col === c} onClick={() => setCol(c)} className={`h-11 w-11 rounded-full ${col === c ? "ring-2 ring-parchment ring-offset-2 ring-offset-canopy" : ""}`} style={{ background: c }} />)}</div></fieldset>
        <Button type="submit" busy={busy === "create"} reason={!name.trim() ? "Give the tribe a name." : undefined}>Create tribe</Button>
      </form>

      <section className="space-y-1"><h2 className="text-2xl font-black">Tribes</h2>
        <p className="text-sm text-sand/80">{free.length} approved {free.length === 1 ? "player isn't" : "players aren't"} on a tribe. Players only see a tribe after you reveal it.</p>
        {(teams.data ?? []).length > 1 && <div className="pt-2"><Button variant="ghost" busy={busy === "revall"} onClick={() => run("revall", () => supabase.from("teams").update({ revealed: true }).eq("competition_id", comp.id), "All tribes revealed.")}>Reveal all tribes</Button></div>}
      </section>
      {(teams.data ?? []).length === 0 ? <Empty title="No tribes yet">Create the first one above.</Empty> : (
        <ul className="space-y-4">{teams.data!.map((t) => { const ms = active.filter((m) => m.team_id === t.id); const isFull = ms.length >= comp.team_size; const sel = pick[t.id] ?? ""; return (
          <li key={t.id} className="flex gap-3 rounded-md bg-white/[.05] p-4"><Stripe color={tribeColor(t.color)} />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2"><TeamBadge team={t} /><Pill tone={t.revealed ? "ok" : "warn"}>{t.revealed ? "Revealed" : "Hidden"}</Pill>{t.status === "withdrawn" && <Pill tone="bad">Withdrawn</Pill>}<span className="text-sm text-sand/70">{ms.length} of {comp.team_size}</span></div>
              <ul className="space-y-2">{ms.map((m) => (<li key={m.id} className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2">{nm(regOf(m.registration_id))}{m.is_captain && <Pill tone="gold">Captain</Pill>}</span>
                <span className="flex gap-1.5">{!m.is_captain && <Button variant="quiet" onClick={() => makeCaptain(t, m)}>Make captain</Button>}<Button variant="quiet" reason={free.length === 0 ? "No free players to swap in." : undefined} onClick={() => { setReplace({ team: t, member: m }); setRepWith(""); }}>Replace</Button><Button variant="quiet" onClick={() => setDrop(m)}>Remove</Button></span></li>))}
                {ms.length === 0 && <li className="text-sm text-sand/70">No players yet.</li>}</ul>
              <div className="flex flex-wrap items-start gap-2">
                <select aria-label={`Add a player to ${t.name}`} className={`${inputCls} max-w-56`} value={sel} onChange={(e) => setPick({ ...pick, [t.id]: e.target.value })}><option value="">Add a player...</option>{free.map((r) => <option key={r.id} value={r.id}>{nm(r)}</option>)}</select>
                <Button variant="ghost" busy={busy === "add" + t.id} reason={isFull ? "This tribe is full." : t.status === "withdrawn" ? "This tribe has withdrawn." : !sel ? "Pick a player first." : undefined}
                  onClick={async () => { if (await run("add" + t.id, () => supabase.from("team_members").insert({ team_id: t.id, registration_id: sel, is_captain: ms.length === 0 }), "Player added.")) setPick({ ...pick, [t.id]: "" }); }}>Add to tribe</Button></div>
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                <Button variant="ghost" busy={busy === "rev" + t.id} onClick={() => run("rev" + t.id, () => supabase.from("teams").update({ revealed: !t.revealed }).eq("id", t.id), t.revealed ? "Tribe hidden." : "Tribe revealed.")}>{t.revealed ? "Hide tribe" : "Reveal tribe"}</Button>
                <Button variant="ghost" reason={t.status === "withdrawn" ? "Already withdrawn." : undefined} onClick={() => setWithdraw(t)}>Withdraw tribe</Button>
                <Button variant="quiet" onClick={() => setRemove(t)}>Delete tribe</Button></div>
            </div></li>); })}</ul>)}

      <Confirm open={!!withdraw} title={`Withdraw ${withdraw?.name}?`} body="Every unplayed match for this tribe becomes a walkover (6-0, 6-0, 6-0) for the opponent, in one go. Approved results stay as they are." confirmLabel="Withdraw tribe" danger busy={busy === "wd"}
        onClose={() => setWithdraw(null)} onConfirm={async () => { if (await run("wd", () => supabase.rpc("withdraw_team", { p_team: withdraw!.id, p_confirm: true }), "Tribe withdrawn. Unplayed matches converted.")) setWithdraw(null); }} />
      <Confirm open={!!remove} title={`Delete ${remove?.name}?`} body="This only works for a tribe with no fixtures. Its players go back to unassigned." confirmLabel="Delete tribe" danger busy={busy === "del"}
        onClose={() => setRemove(null)} onConfirm={async () => { if (await run("del", async () => { await supabase.from("team_members").delete().eq("team_id", remove!.id); return supabase.from("teams").delete().eq("id", remove!.id); }, "Tribe deleted.")) setRemove(null); }} />
      <Confirm open={!!drop} title="Remove this player from the tribe?" body="They go back to unassigned. Their registration and payment stay as they are." confirmLabel="Remove" danger busy={busy === "drop"}
        onClose={() => setDrop(null)} onConfirm={async () => { if (await run("drop", () => supabase.from("team_members").update({ left_at: new Date().toISOString(), is_captain: false }).eq("id", drop!.id), "Player removed.")) setDrop(null); }} />
      <Modal open={!!replace} onClose={() => setReplace(null)} title="Replace player">
        <p className="mb-3 text-sm text-sand/90">Swap {nm(regOf(replace?.member.registration_id ?? ""))} for someone else. The old membership stays in the history.{replace?.member.is_captain && " The new player becomes captain."}</p>
        <Field label="Replacement">{(id) => <select id={id} className={inputCls} value={repWith} onChange={(e) => setRepWith(e.target.value)}><option value="">Choose a player...</option>{free.map((r) => <option key={r.id} value={r.id}>{nm(r)}</option>)}</select>}</Field>
        <label className="mt-3 flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-fern" checked={carry} onChange={(e) => setCarry(e.target.checked)} />Carry the entry fee over: mark the new player paid and withdraw the old registration</label>
        <div className="mt-5 flex justify-end gap-2"><Button variant="quiet" onClick={() => setReplace(null)}>Cancel</Button><Button busy={busy === "rep"} reason={!repWith ? "Choose a replacement." : undefined} onClick={doReplace}>Replace player</Button></div>
      </Modal>
    </div>
  );
}
