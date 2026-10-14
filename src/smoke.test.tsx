import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";

describe("app smoke", () => {
  it("renders the home page", async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><App /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("Survivor", {}, { timeout: 5000 })).toBeTruthy();
  });
});
