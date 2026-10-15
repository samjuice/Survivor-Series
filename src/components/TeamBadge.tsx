import { Emblem, tribeColor } from "./Emblems";
import type { Team } from "@/types";
export function TeamBadge({ team, size = "md", dim }: { team: Pick<Team, "name" | "emblem_key" | "color"> | undefined; size?: "sm" | "md" | "lg"; dim?: boolean }) {
  const s = { sm: "h-7 w-7 p-1.5", md: "h-9 w-9 p-2", lg: "h-14 w-14 p-3" }[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${dim ? "opacity-60" : ""}`}>
      <span className={`grid shrink-0 place-items-center rounded-full text-parchment ${s}`} style={{ background: tribeColor(team?.color) }}><Emblem k={team?.emblem_key} className="h-full w-full" /></span>
      <span className={`font-display font-bold ${size === "lg" ? "text-2xl" : "text-base"}`}>{team?.name ?? "Tribe"}</span>
    </span>
  );
}
