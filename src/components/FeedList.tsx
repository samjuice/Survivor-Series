import { fmtDateTime } from "@/lib/format";
import type { FeedEvent } from "@/types";

const s = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
export function feedText(e: FeedEvent): string {
  const p = e.payload;
  switch (e.kind) {
    case "player_joined": return `${s(p.name)} joined the series.`;
    case "fixtures_generated": return `Fixtures are out: ${s(p.fixtures)} matches over ${s(p.rounds)} rounds.`;
    case "fixture_scheduled": return `${s(p.team_a)} v ${s(p.team_b)} is set for ${p.scheduled_at ? fmtDateTime(String(p.scheduled_at)) : "a date to be confirmed"}.`;
    case "result_approved": {
      const sets = Array.isArray(p.sets) ? (p.sets as number[][]) : [];
      const line = sets.map((x) => `${x[0]}-${x[1]}`).join(", ");
      return p.walkover ? `${s(p.winner)} won ${s(p.team_a)} v ${s(p.team_b)} by walkover.` : `${s(p.winner)} won ${s(p.team_a)} v ${s(p.team_b)} (${line}).`;
    }
    case "announcement": return `New announcement: ${s(p.title)}`;
    case "team_withdrawn": return `${s(p.team)} withdrew. Their unplayed matches go to the opponents.`;
    default: return "Something happened in the series.";
  }
}
export default function FeedList({ events }: { events: FeedEvent[] }) {
  return (
    <ol className="space-y-3">
      {events.map((e) => <li key={e.id} className="border-l-2 border-sand/25 pl-3"><p>{feedText(e)}</p><p className="text-xs text-sand/70">{fmtDateTime(e.created_at)}</p></li>)}
    </ol>
  );
}
