import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useComp } from "@/lib/comp";
import { useAction } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { PHASE_LABEL } from "@/lib/format";
import { Button, Empty, Field, Pill, inputCls } from "@/components/ui";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export default function Competitions() {
  const { user } = useAuth(); const { competitions, setCompId, isOwner } = useComp(); const nav = useNavigate(); const qc = useQueryClient(); const { run, busy } = useAction();
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [cap, setCap] = useState("20"); const [size, setSize] = useState("4"); const [fee, setFee] = useState("0"); const [adm, setAdm] = useState("0"); const [ends, setEnds] = useState("");
  if (!isOwner) return <Empty title="Platform owner only">Only the platform owner can create competitions.</Empty>;
  const s = slug || slugify(name);
  const reason = !name.trim() ? "Give the competition a name." : !s ? "Use letters or numbers in the name." : !(Number(cap) >= 1) ? "Capacity must be at least 1." : !(Number(size) >= 2) ? "Tribes need at least 2 players." : undefined;
  const create = async () => {
    const { data, error } = await supabase.from("competitions").insert({ name: name.trim(), slug: s, capacity: Number(cap), team_size: Number(size), entry_fee_cents: Math.round(Number(fee) * 100), admin_fee_cents: Math.round(Number(adm) * 100), completion_target: ends || null, created_by: user!.id }).select("id").single();
    if (error) { await run("x", async () => ({ error: { message: /duplicate/i.test(error.message) ? "That web name is already used. Change it and try again." : error.message } })); return; }
    await qc.invalidateQueries({ queryKey: ["competitions"] }); setCompId(data.id); nav("/admin/settings");
  };
  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <h2 className="text-2xl font-black">New competition</h2>
        <Field label="Name">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="November 2026 Survivor Padel Series" />}</Field>
        <Field label="Web name" hint="Lowercase letters, numbers and dashes. Filled in for you.">{(id, d) => <input id={id} aria-describedby={d} className={inputCls} value={slug || slugify(name)} onChange={(e) => setSlug(slugify(e.target.value))} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Capacity">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={cap} onChange={(e) => setCap(e.target.value)} />}</Field><Field label="Players per tribe">{(id) => <input id={id} inputMode="numeric" className={inputCls} value={size} onChange={(e) => setSize(e.target.value)} />}</Field>
          <Field label="Entry fee (rand)">{(id) => <input id={id} inputMode="decimal" className={inputCls} value={fee} onChange={(e) => setFee(e.target.value)} />}</Field><Field label="Admin fee (rand)">{(id) => <input id={id} inputMode="decimal" className={inputCls} value={adm} onChange={(e) => setAdm(e.target.value)} />}</Field></div>
        <Field label="Finishes by">{(id) => <input id={id} type="date" className={inputCls} value={ends} onChange={(e) => setEnds(e.target.value)} />}</Field>
        <p className="text-sm text-sand/80">It starts as a draft that only admins can see. Open registration from Settings when you're ready.</p>
        <Button type="submit" busy={busy === "x"} reason={reason}>Create competition</Button>
      </form>
      <section className="space-y-2"><h2 className="text-2xl font-black">All competitions</h2>
        {competitions.length === 0 ? <p className="text-sand/80">None yet.</p> : competitions.map((c) => <button key={c.id} onClick={() => { setCompId(c.id); nav("/admin"); }} className="flex w-full items-center justify-between rounded-md bg-white/[.05] p-3.5 text-left hover:bg-white/10"><span className="font-semibold">{c.name}</span><Pill>{PHASE_LABEL[c.phase]}</Pill></button>)}</section>
    </div>
  );
}
