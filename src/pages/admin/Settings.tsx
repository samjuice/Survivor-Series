import { useState, type ReactNode } from "react";
import { useComp } from "@/lib/comp";
import { useAction, usePaymentInfo, usePrizePool } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { fmtRand, PHASE_LABEL } from "@/lib/format";
import { Banner, Button, Empty, Field, Loading, inputCls } from "@/components/ui";
import type { Competition } from "@/types";
import type { Phase } from "@/types";

const PHASES: [Phase, string][] = [
  ["draft", "Only admins can see the competition."], ["registration", "Players can join. Nothing else yet."], ["opening", "The opening Americano. Captains may enter scores."],
  ["tribal", "Tribal matches. Captains may enter scores."], ["finale", "The closing mixed-tribe Americano and awards."], ["completed", "The series is over."],
];
const rand = (c: number | null) => (c == null ? "" : String(c / 100));
const cents = (v: string) => Math.round(Number(v) * 100);

function Check({ label, hint, checked, onChange }: { label: string; hint: ReactNode; checked: boolean; onChange: (b: boolean) => void }) {
  return <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-fern" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span><span className="block font-medium">{label}</span><span className="block text-sm text-sand/80">{hint}</span></span></label>;
}
export default function Settings() {
  const { comp } = useComp();
  const pay = usePaymentInfo(comp?.id);
  if (!comp) return <Empty title="No competition yet" />;
  if (pay.data === undefined) return <Loading />;
  // Keyed by competition so switching competitions starts a fresh form; realtime refreshes never wipe typing.
  return <SettingsForm key={comp.id} comp={comp} instructions={pay.data} />;
}

function SettingsForm({ comp, instructions }: { comp: Competition; instructions: string }) {
  const cid = comp.id; const { run, busy } = useAction(cid);
  const prize = usePrizePool(cid);
  const [f, setF] = useState({ name: comp.name, phase: comp.phase as Phase, capacity: String(comp.capacity), team_size: String(comp.team_size), fee: rand(comp.entry_fee_cents), adminFee: rand(comp.admin_fee_cents), override: rand(comp.prize_pool_override_cents), ppw: String(comp.points_per_win), starts: comp.starts_on ?? "", ends: comp.completion_target ?? "", table: comp.show_table, fixtures: comp.show_fixtures, instructions });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const cap = Number(f.capacity), size = Number(f.team_size);
  const errs: string[] = [];
  if (!f.name.trim()) errs.push("Give the competition a name.");
  if (!Number.isInteger(cap) || cap < 1) errs.push("Capacity must be a whole number of at least 1.");
  if (!Number.isInteger(size) || size < 2) errs.push("Team size must be at least 2.");
  if (!(Number(f.fee) >= 0) || !(Number(f.adminFee) >= 0)) errs.push("Fees can't be negative.");
  if (f.override !== "" && !(Number(f.override) >= 0)) errs.push("The prize pool override can't be negative.");
  if (!(Number(f.ppw) >= 1)) errs.push("Points per win must be at least 1.");
  const remainder = Number.isInteger(cap) && Number.isInteger(size) && size > 0 ? cap % size : 0;
  const save = async () => {
    const ok = await run("save", () => supabase.from("competitions").update({
      name: f.name.trim(), phase: f.phase, capacity: cap, team_size: size, entry_fee_cents: cents(f.fee), admin_fee_cents: cents(f.adminFee),
      prize_pool_override_cents: f.override === "" ? null : cents(f.override), points_per_win: Number(f.ppw), starts_on: f.starts || null, completion_target: f.ends || null,
      show_table: f.table, show_fixtures: f.fixtures,
    }).eq("id", comp.id));
    if (ok) await run("pay", () => supabase.from("payment_info").upsert({ competition_id: comp.id, instructions: f.instructions, updated_at: new Date().toISOString() }), "Settings saved.");
  };
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h2 className="text-2xl font-black">Settings</h2>
      <Field label="Competition name">{(id) => <input id={id} className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} />}</Field>
      <Field label="Phase" hint={PHASES.find(([p]) => p === f.phase)?.[1]}>{(id, d) => <select id={id} aria-describedby={d} className={inputCls} value={f.phase} onChange={(e) => set("phase", e.target.value as Phase)}>{PHASES.map(([p]) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}</select>}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Capacity (players)">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} />}</Field>
        <Field label="Players per tribe">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={f.team_size} onChange={(e) => set("team_size", e.target.value)} />}</Field>
      </div>
      {remainder !== 0 && <Banner tone="warn" title={`${cap} players don't split evenly into tribes of ${size}`}>{remainder} {remainder === 1 ? "player" : "players"} would be left over. Try a capacity of {cap - remainder} or {cap + (size - remainder)}, or change the tribe size.</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entry fee (rand)">{(id) => <input id={id} inputMode="decimal" className={inputCls} value={f.fee} onChange={(e) => set("fee", e.target.value)} />}</Field>
        <Field label="Admin fee (rand)" hint="Taken off the prize pool.">{(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" className={inputCls} value={f.adminFee} onChange={(e) => set("adminFee", e.target.value)} />}</Field>
      </div>
      <Field label="Prize pool override (rand)" hint={`Leave blank to use paid entries minus the admin fee. Right now that works out to ${prize.data != null ? fmtRand(prize.data) : "R0"}.`}>{(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" className={inputCls} value={f.override} onChange={(e) => set("override", e.target.value)} />}</Field>
      <Field label="Points per win" hint="Changing this after results are approved is blocked.">{(id, d) => <input id={id} aria-describedby={d} inputMode="numeric" className={inputCls} value={f.ppw} onChange={(e) => set("ppw", e.target.value)} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts on">{(id) => <input id={id} type="date" className={inputCls} value={f.starts} onChange={(e) => set("starts", e.target.value)} />}</Field>
        <Field label="Finishes by">{(id) => <input id={id} type="date" className={inputCls} value={f.ends} onChange={(e) => set("ends", e.target.value)} />}</Field>
      </div>
      <div className="space-y-2"><Check label="Show the table to players" hint="Also reveals approved results." checked={f.table} onChange={(b) => set("table", b)} /><Check label="Show the fixtures to players" hint="Players see matches and times." checked={f.fixtures} onChange={(b) => set("fixtures", b)} /></div>
      <Field label="EFT payment instructions" hint="Only people who registered, and admins, can read this.">{(id, d) => <textarea id={id} aria-describedby={d} rows={4} className={`${inputCls} py-2`} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} />}</Field>
      {errs.length > 0 && <Banner tone="error" title="Fix these before saving">{errs.map((e) => <div key={e}>{e}</div>)}</Banner>}
      <Button type="submit" busy={busy === "save" || busy === "pay"} reason={errs[0]}>Save settings</Button>
    </form>
  );
}
