export interface TeamSlot { id: string; existing: number; }
export interface Plan { assignments: { team_id: string; registrations: string[] }[]; unplaced: string[]; }

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Random, balanced assignment: shuffled players go to whichever tribe currently has the fewest. */
export function planTribes(players: string[], teams: TeamSlot[], teamSize: number, seed: number): Plan {
  const rand = rng(seed); const pool = [...players];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const size = new Map(teams.map((t) => [t.id, t.existing])); const got = new Map(teams.map((t) => [t.id, [] as string[]])); const unplaced: string[] = [];
  for (const p of pool) {
    const open = teams.filter((t) => size.get(t.id)! < teamSize).sort((a, b) => size.get(a.id)! - size.get(b.id)!);
    if (!open.length) { unplaced.push(p); continue; }
    got.get(open[0].id)!.push(p); size.set(open[0].id, size.get(open[0].id)! + 1);
  }
  return { assignments: teams.map((t) => ({ team_id: t.id, registrations: got.get(t.id)! })), unplaced };
}

export interface Fit { fits: boolean; remainder: number; summary: string; options: string[]; }
/** Explains whether the player count suits the tribes and offers valid choices when it doesn't. */
export function explainFit(players: number, tribes: number, teamSize: number): Fit {
  const cap = tribes * teamSize;
  if (tribes < 1) return { fits: false, remainder: players, summary: "Create at least one tribe first.", options: [] };
  if (players === cap) return { fits: true, remainder: 0, summary: `${players} players split perfectly into ${tribes} tribes of ${teamSize}.`, options: [] };
  const options: string[] = [];
  if (players < cap) {
    const short = cap - players; const small = short, big = tribes - short;
    if (short < tribes) options.push(`Keep ${tribes} tribes: ${big > 0 ? `${big} of ${teamSize} and ` : ""}${small} of ${teamSize - 1} players.`);
    options.push(`Add ${short} more ${short === 1 ? "player or placeholder" : "players or placeholders"} to fill every tribe.`);
    for (let t = tribes - 1; t >= 1; t--) if (players % t === 0 && players / t <= teamSize && players / t >= 2) options.push(`Use ${t} tribes of ${players / t}.`);
    return { fits: false, remainder: short, summary: `${players} players leave ${short} ${short === 1 ? "place" : "places"} empty across ${tribes} tribes of ${teamSize}.`, options };
  }
  const over = players - cap; const needTribes = Math.ceil(players / teamSize);
  options.push(`Add ${needTribes - tribes} more ${needTribes - tribes === 1 ? "tribe" : "tribes"} (${needTribes} tribes of up to ${teamSize}).`);
  options.push(`Raise the tribe size to ${Math.ceil(players / tribes)} in Settings.`);
  options.push(`Waitlist the last ${over} ${over === 1 ? "player" : "players"}.`);
  return { fits: false, remainder: over, summary: `${players} players are ${over} more than ${tribes} tribes of ${teamSize} can hold.`, options };
}
