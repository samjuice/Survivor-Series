import { Link } from "react-router-dom";
import { useComp } from "@/lib/comp";
import { useFixtures, useRegistrations, useResults, useTeams, useMembers, usePrizePool, useAnnouncements } from "@/lib/data";
import { fmtRand, PHASE_LABEL } from "@/lib/format";
import { Empty, Loading } from "@/components/ui";

function Slab({ to, big, title, note }: { to: string; big: string | number; title: string; note?: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-md bg-white/[.05] p-4 hover:bg-white/10">
      <span className="num min-w-16 font-display text-4xl font-black">{big}</span>
      <span><span className="block font-semibold">{title}</span>{note && <span className="block text-sm text-sand/80">{note}</span>}</span>
    </Link>
  );
}
export default function Overview() {
  const { comp, isOwner } = useComp(); const cid = comp?.id;
  const regs = useRegistrations(cid); const teams = useTeams(cid); const fx = useFixtures(cid); const res = useResults(cid);
  const members = useMembers(cid); const prize = usePrizePool(cid); const anns = useAnnouncements(cid);
  if (!comp) return <Empty title="No competition yet" action={isOwner ? <Link to="/admin/competitions" className="underline">Create one</Link> : undefined}>Create a competition to get started.</Empty>;
  if (regs.isLoading || teams.isLoading || fx.isLoading || res.isLoading) return <Loading />;
  const r = regs.data ?? []; const approved = r.filter((x) => x.status === "approved");
  const pending = r.filter((x) => x.status === "pending").length;
  const unpaid = approved.filter((x) => x.payment_status === "unpaid").length;
  const placed = new Set((members.data ?? []).filter((m) => !m.left_at).map((m) => m.registration_id));
  const unplaced = approved.filter((x) => !placed.has(x.id)).length;
  const f = fx.data ?? []; const waiting = (res.data ?? []).filter((x) => x.status === "pending").length;
  return (
    <div className="space-y-2.5">
      <Slab to="/admin/registrations" big={pending} title="Registrations waiting" note={`${approved.length} of ${comp.capacity} places filled, ${unpaid} unpaid`} />
      <Slab to="/admin/tribes" big={(teams.data ?? []).length} title="Tribes" note={unplaced ? `${unplaced} approved players aren't on a tribe` : "Everyone approved is on a tribe"} />
      <Slab to="/admin/fixtures" big={f.filter((x) => x.status === "scheduled").length} title="Matches still to play" note={f.length ? `${f.length} fixtures in total` : "Fixtures not generated yet"} />
      <Slab to="/admin/results" big={waiting} title="Results to approve" note={waiting ? "Players are waiting on you" : "Nothing waiting"} />
      <Slab to="/admin/announcements" big={(anns.data ?? []).length} title="Announcements" />
      <Slab to="/admin/settings" big={prize.data != null ? fmtRand(prize.data) : "-"} title="Prize pool" note={`Phase: ${PHASE_LABEL[comp.phase]}`} />
    </div>
  );
}
