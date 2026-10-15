import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/ui";
import "./index.css";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode><ErrorBoundary><QueryClientProvider client={qc}><BrowserRouter><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></BrowserRouter></QueryClientProvider></ErrorBoundary></StrictMode>,
);
