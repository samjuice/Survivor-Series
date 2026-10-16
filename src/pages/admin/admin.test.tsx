import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { rpcMock, Wrap } from "@/test-utils";

vi.mock("@/lib/supabase", async () => { const m = await import("@/test-utils"); return { supabase: m.supabaseMock, isConfigured: true }; });
import RandomAssign from "./RandomAssign";
import { ScoreRow } from "./Americano";
import type { AmericanoMatch, Competition, Registration, Team, TeamMember } from "@/types";

const comp = { id: "c1", name: "Series", team_size: 4, capacity: 12 } as Competition;
const team = (id: string, name: string): Team => ({ id, competition_id: "c1", name, emblem_key: "fang", color: null, status: "active", revealed: false, revealed_at: null });
const reg = (i: number): Registration => ({ id: "r" + i, competition_id: "c1", user_id: "u" + i, placeholder_name: null, status: "approved", payment_status: "paid", paid_at: null, created_at: "", });
const nameOf = (r: Registration) => "Player " + r.id.slice(1);
const regsN = (n: number) => Array.from({ length: n }, (_, i) => reg(i + 1));
const setup = (n: number, active: TeamMember[] = []) => {
  const run = vi.fn(async (_k: string, fn: () => PromiseLike<unknown>) => { await fn(); return true; });
  render(<Wrap><RandomAssign comp={comp} teams={[team("a", "Alpha"), team("b", "Bravo"), team("c", "Charlie")]} regs={regsN(n)} active={active} nameOf={nameOf} run={run as never} busy={null} /></Wrap>);
  return run;
};
beforeEach(() => { cleanup(); vi.clearAllMocks(); rpcMock.mockResolvedValue({ error: null }); });

describe("random tribes", () => {
  it("says a perfect split fits and previews every player exactly once", () => {
    setup(12); expect(screen.getByText(/12 players split perfectly into 3 tribes of 4/)).toBeTruthy();
    const text = document.body.textContent ?? ""; for (let i = 1; i <= 12; i++) expect(text.match(new RegExp(`Player ${i}(?!\\d)`, "g"))?.length).toBe(1);
  });
  it("explains the remainder and offers valid choices when the count doesn't fit", () => {
    setup(10); expect(screen.getByText(/10 players leave 2 places empty/)).toBeTruthy(); expect(screen.getByText(/Add 2 more players or placeholders/)).toBeTruthy();
  });
  it("applies the previewed assignment without clearing anyone", async () => {
    setup(12); fireEvent.click(screen.getByRole("button", { name: "Apply this assignment" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    const [fn, args] = rpcMock.mock.calls[0]; expect(fn).toBe("assign_tribes"); expect(args.p_clear).toBe(false); expect(args.p_confirm).toBe(false);
    expect(args.p_assignments.flatMap((a: { registrations: string[] }) => a.registrations)).toHaveLength(12);
  });
  it("asks for explicit confirmation before reshuffling everyone, and only then clears", async () => {
    setup(12); fireEvent.click(screen.getByLabelText(/Start again with everyone/)); fireEvent.click(screen.getByRole("button", { name: "Apply this assignment" }));
    expect(await screen.findByText("Reshuffle everyone?")).toBeTruthy(); expect(rpcMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reshuffle everyone" }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalled()); expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_clear: true, p_confirm: true });
  });
  it("disables Apply with a reason when everyone is already placed", () => {
    const active: TeamMember[] = regsN(12).map((r, i) => ({ id: "m" + i, team_id: ["a", "b", "c"][i % 3], registration_id: r.id, is_captain: false, joined_at: "", left_at: null }));
    setup(12, active); expect((screen.getByRole("button", { name: "Apply this assignment" }) as HTMLButtonElement).disabled).toBe(true); expect(screen.getAllByText(/already on a tribe/).length).toBeGreaterThan(0);
  });
});

describe("americano score entry", () => {
  const m: AmericanoMatch = { id: "m1", event_id: "e1", round: 1, court: 1, a1: "a", a2: "b", b1: "c", b2: "d", score_a: null, score_b: null, status: "scheduled" };
  const show = (live = true) => { const onSave = vi.fn(); render(<ScoreRow m={m} names={(id) => id.toUpperCase()} ppm={24} live={live} onSave={onSave} busy={false} />); return onSave; };
  it("fills in the other score so the pair adds up to 24", () => {
    show(); fireEvent.change(screen.getByLabelText(/first pair score/), { target: { value: "14" } });
    expect((screen.getByLabelText(/second pair score/) as HTMLInputElement).value).toBe("10");
  });
  it("saves a valid score", () => {
    const onSave = show(); fireEvent.change(screen.getByLabelText(/first pair score/), { target: { value: "14" } }); fireEvent.click(screen.getByRole("button", { name: "Save score" })); expect(onSave).toHaveBeenCalledWith(14, 10);
  });
  it("blocks a wrong total with a visible reason", () => {
    show(); fireEvent.change(screen.getByLabelText(/first pair score/), { target: { value: "30" } }); fireEvent.change(screen.getByLabelText(/second pair score/), { target: { value: "30" } });
    expect((screen.getByRole("button", { name: "Save score" }) as HTMLButtonElement).disabled).toBe(true); expect(screen.getByText("The scores must add up to 24.")).toBeTruthy();
  });
  it("blocks scoring until the Americano is live", () => {
    show(false); fireEvent.change(screen.getByLabelText(/first pair score/), { target: { value: "14" } }); expect(screen.getByText(/Make the Americano live/)).toBeTruthy();
  });
});
