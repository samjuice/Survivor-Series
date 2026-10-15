import { describe, expect, it } from "vitest";
import { isValidSet, setsWon, validateSets } from "./scores";

describe("set rules (same rules the database enforces)", () => {
  it("accepts exactly 6-0..6-4, 7-5 and 7-6 in either direction, and nothing else", () => {
    const valid = new Set<string>();
    for (let b = 0; b <= 4; b++) { valid.add(`6-${b}`); valid.add(`${b}-6`); }
    ["7-5", "7-6", "5-7", "6-7"].forEach((s) => valid.add(s));
    for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) expect(isValidSet(a, b), `${a}-${b}`).toBe(valid.has(`${a}-${b}`));
  });
  it("explains 6-5, level sets and scores above 7", () => {
    const v = validateSets([{ a: "6", b: "5" }, { a: "4", b: "4" }, { a: "8", b: "6" }]);
    expect(v.ok).toBe(false); expect(v.parsed).toBeNull();
    expect(v.setErrors[0]).toMatch(/6-5 isn't a finished set/); expect(v.setErrors[1]).toMatch(/level/); expect(v.setErrors[2]).toMatch(/above 7/);
    expect(v.matchError).toMatch(/exactly 3 sets/);
  });
  it("requires all 3 sets with both scores, whole numbers", () => {
    expect(validateSets([{ a: "6", b: "0" }, { a: "6", b: "0" }, { a: "", b: "" }]).ok).toBe(false);
    expect(validateSets([{ a: "6", b: "x" }, { a: "6", b: "0" }, { a: "6", b: "0" }]).setErrors[0]).toMatch(/whole numbers/);
    expect(validateSets([{ a: "6", b: "" }, { a: "6", b: "0" }, { a: "6", b: "0" }]).setErrors[0]).toMatch(/both scores/);
  });
  it("accepts a valid match and counts sets won", () => {
    const v = validateSets([{ a: "7", b: "5" }, { a: "3", b: "6" }, { a: "7", b: "6" }]);
    expect(v.ok).toBe(true); expect(v.parsed).toEqual([[7, 5], [3, 6], [7, 6]]); expect(setsWon(v.parsed!)).toEqual([2, 1]);
  });
});
