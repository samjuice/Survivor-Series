import { describe, expect, it } from "vitest";
import { countdown, fmtRand, fromLocalInput, toLocalInput } from "./format";
import { feedText } from "@/components/FeedList";

describe("formatting", () => {
  it("formats rand from cents", () => { expect(fmtRand(290000)).toBe("R2 900"); expect(fmtRand(0)).toBe("R0"); });
  it("round-trips South African time for the date picker", () => {
    const iso = fromLocalInput("2026-11-10T18:30")!;
    expect(iso).toBe("2026-11-10T16:30:00.000Z"); expect(toLocalInput(iso)).toBe("2026-11-10T18:30"); expect(fromLocalInput("")).toBeNull();
  });
  it("counts down and stops at zero", () => {
    const c = countdown(new Date("2026-11-10T10:00:00Z"), new Date("2026-11-08T08:58:30Z"));
    expect(c).toMatchObject({ days: 2, hours: 1, minutes: 1, seconds: 30, done: false });
    expect(countdown(new Date("2026-01-01"), new Date("2026-02-01")).done).toBe(true);
  });
});
describe("feed text", () => {
  it("describes events in plain language", () => {
    expect(feedText({ id: 1, competition_id: "c", kind: "player_joined", payload: { name: "Sam" }, created_at: "" })).toBe("Sam joined the series.");
    expect(feedText({ id: 2, competition_id: "c", kind: "result_approved", payload: { team_a: "Fang", team_b: "Leaf", winner: "Fang", sets: [[6, 0], [6, 2], [3, 6]], walkover: false }, created_at: "" })).toBe("Fang won Fang v Leaf (6-0, 6-2, 3-6).");
    expect(feedText({ id: 3, competition_id: "c", kind: "result_approved", payload: { team_a: "Fang", team_b: "Leaf", winner: "Leaf", sets: [[0, 6], [0, 6], [0, 6]], walkover: true }, created_at: "" })).toBe("Leaf won Fang v Leaf by walkover.");
    expect(feedText({ id: 4, competition_id: "c", kind: "unknown_kind", payload: {}, created_at: "" })).toMatch(/happened/);
  });
});
