import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useComp } from "@/lib/comp";
import { regName, useAction, useMembers, useProfiles, useRegistrations } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { fmtShortDate } from "@/lib/format";
import { Banner, Button, Empty, ErrorState, Field, Loading, Modal, Pill, inputCls } from "@/components/ui";
import type { RegStatus } from "@/types";

const FILTERS: [RegStatus | "all", string][] = [["pending", "Waiting"], ["approved", "Approved"], ["waitlisted", "Waitlist"], ["rejected", "Rejected"], ["withdrawn", "Withdrawn"], ["all", "All"]];
export default function Registrations() {
  const { comp } = useComp(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const regs = useRegistrations(cid);
  const ids = useMemo(() => [...new Set((regs.data ?? []).map((r) => r.user_id).filter((x): x is string => !!x))], [regs.data]);
  const profiles = useProfiles(cid, ids); const members = useMembers(cid);
  const [linking, setLinking] = useState<string | null>(null); const [linkTo, setLinkTo] = useState("");
  const [filter, setFilter] = useState<RegStatus | "all">("pending"); const [q, setQ] = useState(""); const [limit, setLimit] = useState(25);
  const [adding, setAdding] = useState(false); const [pname, setPname] = useState(""); const [ppaid, setPpaid] = useState(true);
  if (!comp) return <Empty title="No competition yet" />;
  if (regs.isLoading) return <Loading />;
  if (regs.error) return <ErrorState error={regs.error} retry={() => regs.refetch()} />;
  const all = regs.data ?? []; const approved = all.filter((r) => r.status === "approved").length; const full = approved >= comp.capacity;
  const shown = all.filter((r) => (filter === "all" || r.status === filter) && regName(r, profiles.data).toLowerCase().includes(q.toLowerCase()));
  const setStatus = (id: string, status: RegStatus, msg: string) => run(id + status, () => supabase.from("registrations").update({ status }).eq("id", id), msg);
  const setPaid = (id: string, paid: boolean) => run(id + "pay", () => supabase.from("registrations").update({ payment_status: paid ? "paid" : "unpaid" }).eq("id", id), paid ? "Payment confirmed." : "Payment marked as not received.");
  const addPlaceholder = async () => { if (await run("ph", () => supabase.from("registrations").insert({ competition_id: comp.id, placeholder_name: pname.trim(), status: "approved", payment_status: ppaid ? "paid" : "unpaid" }), "Placeholder added.")) { setAdding(false); setPname(""); } };
  return (
    <div className="space-y-4">
      <Banner tone={full ? "warn" : "info"} title={`${approved} of ${comp.capacity} places filled`}>{full ? <>The competition is full. Waitlist new players, or <Link to="/admin/settings" className="underline">raise the capacity</Link>.</> : `${comp.capacity - approved} places left.`}</Banner>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Search by name" placeholder="Search by name" value={q} onChange={(e) => { setQ(e.target.value); setLimit(25); }} className={`${inputCls} max-w-56`} />
        <Button variant="ghost" onClick={() => setAdding(true)}>Add a paid player who hasn't signed up</Button>
      </div>
      <div className="flex flex-wrap gap-1.5">{FILTERS.map(([k, l]) => <button key={k} onClick={() => { setFilter(k); setLimit(25); }} aria-pressed={filter === k} className={`rounded-full px-3.5 py-2 text-sm ${filter === k ? "bg-parchment font-semibold text-night" : "bg-white/10 text-sand"}`}>{l} <span className="num opacity-70">{k === "all" ? all.length : all.filter((r) => r.status === k).length}</span></button>)}</div>
      {shown.length === 0 ? <Empty title="Nobody here">{filter === "pending" ? "No one is waiting for approval." : "Nothing matches this filter."}</Empty> : (
        <ul className="space-y-2">
          {shown.slice(0, limit).map((r) => (
            <li key={r.id} className="rounded-md bg-white/[.05] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{regName(r, profiles.data)}</p><p className="text-xs text-sand/70">Registered {fmtShortDate(r.created_at)}</p></div>
                <div className="flex gap-1.5"><Pill tone={r.status === "approved" ? "ok" : r.status === "rejected" || r.status === "withdrawn" ? "bad" : "warn"}>{r.status}</Pill><Pill tone={r.payment_status === "paid" ? "ok" : "warn"}>{r.payment_status}</Pill></div></div>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.status !== "approved" && <Button busy={busy === r.id + "approved"} reason={full ? "Competition is full." : undefined} onClick={() => setStatus(r.id, "approved", "Approved.")}>Approve</Button>}
                {r.status === "pending" && <Button variant="ghost" busy={busy === r.id + "waitlisted"} onClick={() => setStatus(r.id, "waitlisted", "Moved to the waitlist.")}>Waitlist</Button>}
                {(r.status === "pending" || r.status === "waitlisted") && <Button variant="ghost" busy={busy === r.id + "rejected"} onClick={() => setStatus(r.id, "rejected", "Rejected.")}>Reject</Button>}
                {!r.user_id && <Button variant="ghost" onClick={() => { setLinking(r.id); setLinkTo(""); }}>Link to a signed-up player</Button>}
                <Button variant="ghost" busy={busy === r.id + "pay"} onClick={() => setPaid(r.id, r.payment_status !== "paid")}>{r.payment_status === "paid" ? "Mark as not paid" : "Confirm payment"}</Button>
              </div>
            </li>))}
        </ul>)}
      {shown.length > limit && <Button variant="ghost" onClick={() => setLimit((l) => l + 25)}>Show 25 more</Button>}
      <Modal open={!!linking} onClose={() => setLinking(null)} title="Link to a signed-up player">
        <p className="mb-3 text-sm text-sand/90">The placeholder keeps their slot, their paid entry fee and their tribe place. The player's own sign-up is merged into it.</p>
        <Field label="Player">{(id) => <select id={id} className={inputCls} value={linkTo} onChange={(e) => setLinkTo(e.target.value)}><option value="">Choose a player...</option>{all.filter((x) => x.user_id && !x.user_id.startsWith("00000000") && !(members.data ?? []).some((m) => m.registration_id === x.id && !m.left_at) && x.status !== "withdrawn" && x.status !== "rejected").map((x) => <option key={x.id} value={x.id}>{regName(x, profiles.data)} ({x.status})</option>)}</select>}</Field>
        <div className="mt-5 flex justify-end gap-2"><Button variant="quiet" onClick={() => setLinking(null)}>Cancel</Button><Button busy={busy === "link"} reason={!linkTo ? "Choose a player." : undefined} onClick={async () => { if (await run("link", () => supabase.rpc("link_placeholder", { p_placeholder: linking, p_registration: linkTo }), "Linked. The player now holds the placeholder's slot.")) setLinking(null); }}>Link player</Button></div>
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add a placeholder">
        <p className="mb-3 text-sm text-sand/90">Use this for someone who paid but hasn't signed up. Their name holds a slot and counts in the prize pool. Replace them later from the Tribes page and the fee carries over.</p>
        <div className="space-y-3"><Field label="Name">{(id) => <input id={id} className={inputCls} value={pname} onChange={(e) => setPname(e.target.value)} />}</Field>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-fern" checked={ppaid} onChange={(e) => setPpaid(e.target.checked)} />Entry fee already received</label></div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="quiet" onClick={() => setAdding(false)}>Cancel</Button><Button busy={busy === "ph"} reason={!pname.trim() ? "Enter a name." : full ? "Competition is full." : undefined} onClick={addPlaceholder}>Add placeholder</Button></div>
      </Modal>
    </div>
  );
}
