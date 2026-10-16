import { useState } from "react";
import { useComp } from "@/lib/comp";
import { useAudit } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { Button, Empty, ErrorState, Loading, inputCls } from "@/components/ui";

const ENTITY_LABEL: Record<string, string> = { registrations: "Registration", teams: "Tribe", team_members: "Tribe member", competitions: "Settings", competition_admins: "Admin", results: "Result", announcements: "Announcement", payment_info: "Payment instructions", profiles: "Player account", lineups: "Line-up", americano_events: "Americano", americano_matches: "Americano match", fixtures: "Fixtures" };
const short = (v: unknown) => (v === null || v === undefined ? "none" : typeof v === "object" ? JSON.stringify(v) : String(v));
function summarize(action: string, d: Record<string, unknown>): string {
  const parts = Object.entries(d).slice(0, 6).map(([k, v]) => {
    if (v && typeof v === "object" && "from" in (v as object)) { const x = v as { from: unknown; to: unknown }; return `${k.replace(/_/g, " ")}: ${short(x.from)} to ${short(x.to)}`; }
    return `${k.replace(/_/g, " ")}: ${short(v)}`;
  });
  return action === "created" || action === "deleted" ? parts.slice(0, 4).join(", ") : parts.join(", ");
}
export default function Audit() {
  const { comp } = useComp(); const [limit, setLimit] = useState(50); const [entity, setEntity] = useState(""); const [q, setQ] = useState("");
  const log = useAudit(comp?.id, limit);
  if (!comp) return <Empty title="No competition yet" />;
  if (log.isLoading) return <Loading />;
  if (log.error) return <ErrorState error={log.error} retry={() => log.refetch()} />;
  const rows = (log.data ?? []).filter((r) => (!entity || r.entity === entity) && (r.actor_name ?? "System").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <p className="text-sm text-sand/80">Every change to players, payments, tribes, results, settings and roles is recorded here, with who did it. Entries can't be edited or deleted. Bank details are never stored in the log.</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by type" className={`${inputCls} max-w-52`} value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Everything</option>{Object.entries(ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input aria-label="Filter by person" placeholder="Filter by person" className={`${inputCls} max-w-52`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {rows.length === 0 ? <Empty title="Nothing logged yet">Changes show up here as they happen.</Empty> : (
        <ul className="space-y-2">{rows.map((r) => (
          <li key={r.id} className="rounded-md bg-white/[.05] p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3"><p><b>{r.actor_name ?? "System"}</b> {r.action.replace(/_/g, " ")} <b>{ENTITY_LABEL[r.entity] ?? r.entity}</b></p><p className="text-xs text-sand/70">{fmtDateTime(r.created_at)}</p></div>
            {Object.keys(r.details).length > 0 && <p className="mt-1 break-words text-sand/80">{summarize(r.action, r.details)}</p>}
          </li>))}</ul>)}
      {(log.data?.length ?? 0) >= limit && <Button variant="ghost" onClick={() => setLimit((l) => l + 50)}>Show 50 more</Button>}
    </div>
  );
}
