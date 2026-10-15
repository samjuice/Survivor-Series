import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { authMock, Wrap } from "@/test-utils";

vi.mock("@/lib/supabase", async () => { const m = await import("@/test-utils"); return { supabase: m.supabaseMock, isConfigured: true }; });
import { AuthProvider } from "@/lib/auth";
import App from "@/App";
import Login from "./Login";

const show = () => render(<Wrap path="/login"><AuthProvider><Login /></AuthProvider></Wrap>);
const fill = (label: RegExp, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

beforeEach(() => { cleanup(); vi.clearAllMocks(); authMock.getSession.mockResolvedValue({ data: { session: null } }); });

describe("sign-in flow", () => {
  it("sends signed-out visitors to the sign-in screen", async () => {
    render(<Wrap path="/"><AuthProvider><App /></AuthProvider></Wrap>);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });
  it("explains a wrong password in plain words", async () => {
    authMock.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    show(); fill(/^email/i, "a@b.co"); fill(/^password/i, "wrongpass1"); fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/don't match/);
  });
  it("offers to resend the confirmation email when the account isn't confirmed", async () => {
    authMock.signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    authMock.resend.mockResolvedValue({ error: null });
    show(); fill(/^email/i, "a@b.co"); fill(/^password/i, "password123"); fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const btn = await screen.findByRole("button", { name: "Resend confirmation email" }); fireEvent.click(btn);
    await waitFor(() => expect(authMock.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "a@b.co" })));
    expect(await screen.findByText(/Only the newest link works/)).toBeTruthy();
  });
  it("handles signing up twice with the same email gracefully", async () => {
    authMock.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    show(); fireEvent.click(screen.getByRole("button", { name: /Create an account/ }));
    fill(/full name/i, "Sam"); fill(/^email/i, "a@b.co"); fill(/^password/i, "password123"); fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already has an account/);
  });
  it("tells a new player to check their inbox, with a resend button", async () => {
    authMock.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    show(); fireEvent.click(screen.getByRole("button", { name: /Create an account/ }));
    fill(/full name/i, "Sam"); fill(/^email/i, "new@b.co"); fill(/^password/i, "password123"); fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Check your inbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resend confirmation email" })).toBeTruthy();
    expect(authMock.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: expect.stringContaining("/auth/callback") }) }));
  });
  it("disables the submit button with a reason until the form is filled in", () => {
    show(); const btn = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true); expect(screen.getByText(/Enter your email/)).toBeTruthy();
  });
  it("never reveals whether an email has an account when resetting a password", async () => {
    authMock.resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found" } });
    show(); fireEvent.click(screen.getByRole("button", { name: "Forgot password" })); fill(/^email/i, "ghost@b.co"); fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Reset link sent")).toBeTruthy();
  });
});
