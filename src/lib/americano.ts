// Americano schedule generator: rotating partners, even byes, optional tribe mixing (for the finale).
export interface GenInput { players: string[]; rounds: number; seed?: number; groups?: Record<string, string>; }
export interface Stats { matchesPerPlayer: Record<string, number>; minMatches: number; maxMatches: number; partnerRepeats: number; sameGroupPartners: number; opponentRepeats: number; courts: number; byesPerRound: number; }
export interface Schedule { rounds: string[][][]; byes: string[][]; stats: Stats; }

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const key = (a: string, b: string) => (a < b ? a + "|" + b : b + "|" + a);

export function generateAmericano({ players, rounds, seed = 1, groups }: GenInput): Schedule {
  const n = players.length;
  if (n < 4) throw new Error("An Americano needs at least 4 players.");
  if (rounds < 1) throw new Error("Choose at least 1 round.");
  const rand = rng(seed); const courts = Math.floor(n / 4); const sitting = n - courts * 4;
  const partner = new Map<string, number>(); const opp = new Map<string, number>(); const byeCount = new Map(players.map((p) => [p, 0]));
  const same = (a: string, b: string) => (groups && groups[a] !== undefined && groups[a] === groups[b] ? 1 : 0);
  const pc = (a: string, b: string) => (partner.get(key(a, b)) ?? 0) * 100 + same(a, b) * 60;
  const oc = (a: string, b: string) => (opp.get(key(a, b)) ?? 0) * 3;
  const matchCost = (m: string[]) => pc(m[0], m[1]) + pc(m[2], m[3]) + oc(m[0], m[2]) + oc(m[0], m[3]) + oc(m[1], m[2]) + oc(m[1], m[3]);
  const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const out: string[][][] = []; const byes: string[][] = [];
  for (let r = 0; r < rounds; r++) {
    const order = shuffle(players).sort((a, b) => byeCount.get(a)! - byeCount.get(b)!);   // fewest byes so far sit out first
    const sit = order.slice(0, sitting); sit.forEach((p) => byeCount.set(p, byeCount.get(p)! + 1));
    let arr = shuffle(players.filter((p) => !sit.includes(p)));
    const total = (a: string[]) => { let c = 0; for (let m = 0; m < courts; m++) c += matchCost(a.slice(m * 4, m * 4 + 4)); return c; };
    let best = total(arr);
    for (let it = 0; it < 600 && best > 0; it++) {
      const i = Math.floor(rand() * arr.length), j = Math.floor(rand() * arr.length); if (i === j) continue;
      const next = [...arr]; [next[i], next[j]] = [next[j], next[i]]; const c = total(next);
      if (c <= best) { arr = next; best = c; }
    }
    const matches: string[][] = [];
    for (let m = 0; m < courts; m++) {
      const mt = arr.slice(m * 4, m * 4 + 4); matches.push(mt);
      partner.set(key(mt[0], mt[1]), (partner.get(key(mt[0], mt[1])) ?? 0) + 1); partner.set(key(mt[2], mt[3]), (partner.get(key(mt[2], mt[3])) ?? 0) + 1);
      for (const a of [mt[0], mt[1]]) for (const b of [mt[2], mt[3]]) opp.set(key(a, b), (opp.get(key(a, b)) ?? 0) + 1);
    }
    out.push(matches); byes.push(sit);
  }
  const matchesPerPlayer = Object.fromEntries(players.map((p) => [p, rounds - byeCount.get(p)!]));
  const counts = Object.values(matchesPerPlayer);
  let sameGroupPartners = 0; for (const rd of out) for (const m of rd) sameGroupPartners += same(m[0], m[1]) + same(m[2], m[3]);
  return { rounds: out, byes, stats: {
    matchesPerPlayer, minMatches: Math.min(...counts), maxMatches: Math.max(...counts), courts, byesPerRound: sitting,
    partnerRepeats: [...partner.values()].reduce((s, v) => s + Math.max(0, v - 1), 0), sameGroupPartners,
    opponentRepeats: [...opp.values()].reduce((s, v) => s + Math.max(0, v - 1), 0) } };
}
