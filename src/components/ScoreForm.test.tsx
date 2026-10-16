import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { rpcMock, Wrap } from "@/test-utils";

vi.mock("@/lib/supabase", async () => { const m = await import("@/test-utils"); return { supabase: m.supabaseMock, isConfigured: true }; });
import ScoreForm from "./ScoreForm";
import type { Fixture, Team } from "@/types";

const fx: Fixture = { id: "f1", competition_id: "c1", round: 1, team_a: "a", team_b: "b", scheduled_at: null, status: "scheduled" };
const A: Team = { id: "a", competition_id: "c1", name: "Fang", emblem_key: "fang", color: null, status: "active", revealed: true, revealed_at: null };
const B: Team = { ...A, id: "b", name: "Leaf" };
const show = (admin = false) => render(<Wrap><ScoreForm fixture={fx} teamA={A} teamB={B} isAdmin={admin} /></Wrap>);
const set = (i: number, side: "Fang" | "Leaf", v: string) => fireEvent.change(screen.getByLabelText(`Set ${i}, ${side} games`), { target: { value: v } });
beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe("score form", () => {
  it("shows a banner and per-set errors for an impossible score, and does not call the server", async () => {
    show(); set(1, "Fang", "6"); set(1, "Leaf", "5"); set(2, "Fang", "6"); set(2, "Leaf", "0"); set(3, "Fang", "6"); set(3, "Leaf", "1");
    fireEvent.click(screen.getByRole("button", { name: /Send result/ }));
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent).join(" ")).toMatch(/can't be saved yet[\s\S]*Set 1: 6-5 isn't a finished set/);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("sends a valid 3-set result to the database and names the winner", async () => {
    rpcMock.mockResolvedValue({ error: null });
    show(); set(1, "Fang", "6"); set(1, "Leaf", "0"); set(2, "Fang", "3"); set(2, "Leaf", "6"); set(3, "Fang", "7"); set(3, "Leaf", "6");
    expect(screen.getByText(/winning 2 sets to 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Send result/ }));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("submit_result", { p_fixture: "f1", p_sets: [[6, 0], [3, 6], [7, 6]] }));
  });
  it("shows the database's own message if the server refuses", async () => {
    rpcMock.mockResolvedValue({ error: { message: "A result is already awaiting approval for this match" } });
    show(); set(1, "Fang", "6"); set(1, "Leaf", "0"); set(2, "Fang", "6"); set(2, "Leaf", "0"); set(3, "Fang", "6"); set(3, "Leaf", "0");
    fireEvent.click(screen.getByRole("button", { name: /Send result/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already awaiting approval/);
  });
  it("labels the button honestly for admins and includes the How scores work note", () => {
    show(true); expect(screen.getByRole("button", { name: "Save and approve result" })).toBeTruthy(); expect(screen.getByText("How scores work")).toBeTruthy();
  });
});
