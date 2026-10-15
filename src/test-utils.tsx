import { vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui";

export const authMock = {
  getSession: vi.fn(async () => ({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInWithPassword: vi.fn(), signUp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(), signOut: vi.fn(),
};
export const rpcMock = vi.fn();
export const supabaseMock = { auth: authMock, rpc: rpcMock, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() };

export function Wrap({ children, path = "/" }: { children: ReactNode; path?: string }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><ToastProvider>{children}</ToastProvider></MemoryRouter></QueryClientProvider>;
}
