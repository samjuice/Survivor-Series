import { describe, expect, it } from "vitest";
import { generateAmericano } from "./americano";
import { explainFit, planTribes } from "./tribes";
import { toCsv } from "./csv";

const ids = (n: number) => Array.from({ length: n }, (_, i) => "p" + String(i + 1).padStart(2, "0"));

describe("americano generator", () => {
  it("never puts a player on two courts, and everyone plays every round when the count divides by 4", () => {
    const s = generateAmericano({ players: ids(12), rounds: 5, seed: 3 });
    expect(s.rounds).toHaveLength(5);
    for (const rd of s.rounds) { expect(rd).toHaveLength(3); const all = rd.flat(); expect(new Set(all).size).toBe(12); rd.forEach((m) => expect(m).toHaveLength(4)); }
    expect(s.stats.minMatches).toBe(5); expect(s.stats.maxMatches).toBe(5);
  });
  it("keeps partner repeats low for 12 players over 5 rounds", () => { expect(generateAmericano({ players: ids(12), rounds: 5, seed: 3 }).stats.partnerRepeats).toBeLessThanOrEqual(2); });
  it("shares byes evenly when players don't divide by 4", () => {
    const s = generateAmericano({ players: ids(10), rounds: 5, seed: 7 });
    expect(s.stats.courts).toBe(2); expect(s.stats.byesPerRound).toBe(2); s.byes.forEach((b) => expect(b).toHaveLength(2));
    expect(s.stats.maxMatches - s.stats.minMatches).toBeLessThanOrEqual(1);
    for (const [i, rd] of s.rounds.entries()) rd.flat().forEach((p) => expect(s.byes[i]).not.toContain(p));
  });
  it("mixes tribes for the finale (partners from different tribes)", () => {
    const players = ids(20); const groups = Object.fromEntries(players.map((p, i) => [p, "t" + (i % 5)]));
    const s = generateAmericano({ players, rounds: 6, seed: 11, groups });
    expect(s.stats.sameGroupPartners).toBeLessThanOrEqual(1);
  });
  it("is repeatable for a seed and different for another seed", () => {
    const a = generateAmericano({ players: ids(12), rounds: 4, seed: 5 }), b = generateAmericano({ players: ids(12), rounds: 4, seed: 5 }), c = generateAmericano({ players: ids(12), rounds: 4, seed: 6 });
    expect(a.rounds).toEqual(b.rounds); expect(a.rounds).not.toEqual(c.rounds);
  });
  it("refuses fewer than 4 players or no rounds", () => { expect(() => generateAmericano({ players: ids(3), rounds: 3 })).toThrow(/at least 4/); expect(() => generateAmericano({ players: ids(8), rounds: 0 })).toThrow(); });
});

describe("tribe planner", () => {
  it("splits 20 players into 5 tribes of 4, each player exactly once", () => {
    const teams = ids(5).map((id) => ({ id, existing: 0 })); const p = planTribes(ids(20), teams, 4, 9);
    expect(p.assignments.every((a) => a.registrations.length === 4)).toBe(true); expect(p.unplaced).toHaveLength(0);
    expect(new Set(p.assignments.flatMap((a) => a.registrations)).size).toBe(20);
  });
  it("keeps tribes balanced when the count doesn't fit (19 players)", () => {
    const p = planTribes(ids(19), ids(5).map((id) => ({ id, existing: 0 })), 4, 2); const sizes = p.assignments.map((a) => a.registrations.length).sort();
    expect(sizes).toEqual([3, 4, 4, 4, 4]);
  });
  it("respects existing members and capacity, and reports who didn't fit", () => {
    const p = planTribes(ids(6), [{ id: "a", existing: 3 }, { id: "b", existing: 2 }], 4, 1);
    expect(p.assignments[0].registrations.length + p.assignments[1].registrations.length).toBe(3); expect(p.unplaced).toHaveLength(3);
  });
  it("reshuffles differently with a different seed", () => {
    const t = ids(4).map((id) => ({ id, existing: 0 })); expect(planTribes(ids(16), t, 4, 1)).not.toEqual(planTribes(ids(16), t, 4, 2));
  });
  it("explains the remainder and offers valid choices", () => {
    expect(explainFit(20, 5, 4)).toMatchObject({ fits: true, remainder: 0 });
    const low = explainFit(19, 5, 4); expect(low.fits).toBe(false); expect(low.remainder).toBe(1); expect(low.summary).toMatch(/1 place empty/); expect(low.options[0]).toMatch(/4 of 4 and 1 of 3/);
    const mid = explainFit(16, 5, 4); expect(mid.options.join(" ")).toMatch(/4 tribes of 4/);
    const high = explainFit(22, 5, 4); expect(high.remainder).toBe(2); expect(high.options.join(" ")).toMatch(/Add 1 more tribe/); expect(high.options.join(" ")).toMatch(/Waitlist the last 2 players/);
  });
});

describe("csv export", () => {
  it("quotes commas, quotes and newlines", () => { expect(toCsv([["a,b", 'say "hi"', "x\ny", 3, true, null]])).toBe('"a,b","say ""hi""","x\ny",3,true,'); });
  it("defuses spreadsheet formulas in text but leaves real numbers alone", () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "+1", "-2", "@cmd", "ok"]])).toBe('"\'=HYPERLINK(""x"")",\'+1,\'-2,\'@cmd,ok'); expect(toCsv([[-5, 0]])).toBe("-5,0");
  });
});
