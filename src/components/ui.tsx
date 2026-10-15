import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Tone = "error" | "info" | "ok" | "warn";
const TONES: Record<Tone, string> = {
  error: "border-ember/60 bg-ember/10 text-parchment", info: "border-sand/30 bg-white/5 text-parchment",
  ok: "border-olive/60 bg-olive/10 text-parchment", warn: "border-gold/60 bg-gold/10 text-parchment",
};
export function Banner({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border-l-4 px-4 py-3 text-sm ${TONES[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5 text-parchment/85" : ""}>{children}</div>}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "quiet"; busy?: boolean; reason?: string; block?: boolean };
const VARIANT = {
  primary: "bg-fern text-parchment hover:bg-[#487a51] disabled:bg-fern/40",
  ghost: "border border-sand/40 text-parchment hover:bg-white/5",
  quiet: "text-sand hover:bg-white/5",
  danger: "bg-ember/90 text-night hover:bg-ember",
};
// A button is either usable or disabled with a visible reason.
export function Button({ variant = "primary", busy, reason, block, className = "", children, disabled, ...rest }: BtnProps) {
  const id = useId();
  const off = disabled || busy || !!reason;
  return (
    <span className={block ? "block" : "inline-block"}>
      <button {...rest} disabled={off} aria-describedby={reason ? id : undefined}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${block ? "w-full" : ""} ${VARIANT[variant]} ${className}`}>
        {busy && <Spinner className="h-4 w-4" />}{children}
      </button>
      {reason && <span id={id} className="mt-1 block text-xs text-sand/70">{reason}</span>}
    </span>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}
export const Loading = ({ label = "Loading" }: { label?: string }) => <div className="flex items-center gap-3 py-10 text-sand/80"><Spinner />{label}</div>;

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="rounded-md border border-dashed border-sand/25 px-5 py-9 text-center"><p className="font-display text-xl font-bold">{title}</p>{children && <p className="mx-auto mt-1 max-w-sm text-sm text-sand/80">{children}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
export const ErrorState = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <Banner tone="error" title="Couldn't load this">{error instanceof Error ? error.message : "Something went wrong."}{retry && <div className="mt-2"><Button variant="ghost" onClick={retry}>Try again</Button></div>}</Banner>
);

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId(); const d = error ? id + "-e" : hint ? id + "-h" : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-sand">{label}</label>
      {children(id, d)}
      {error ? <p id={id + "-e"} className="mt-1 text-xs text-ember">{error}</p> : hint ? <p id={id + "-h"} className="mt-1 text-xs text-sand/70">{hint}</p> : null}
    </div>
  );
}
export const inputCls = "min-h-11 w-full rounded-md border border-sand/30 bg-night/60 px-3 text-parchment placeholder:text-sand/40 focus:border-sand";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h); ref.current?.focus();
    return () => { document.removeEventListener("keydown", h); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="safe-b max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-canopy p-5 shadow-2xl sm:rounded-2xl">
        <h2 className="mb-3 text-2xl font-black">{title}</h2>{children}
      </div>
    </div>
  );
}
export function Confirm({ open, title, body, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-sand/90">{body}</div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} busy={busy} onClick={onConfirm}>{confirmLabel}</Button></div>
    </Modal>
  );
}

interface ToastMsg { id: number; tone: Tone; text: string; }
const ToastCtx = createContext<(tone: Tone, text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  const push = useCallback((tone: Tone, text: string) => {
    const id = Date.now() + Math.random(); setList((l) => [...l, { id, tone, text }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] mx-auto flex max-w-md flex-col gap-2 px-3" aria-live="polite">
        {list.map((t) => <div key={t.id} className={`pointer-events-auto rounded-md border-l-4 px-4 py-3 text-sm shadow-xl ${t.tone === "error" ? "border-ember bg-[#3a2420]" : "border-olive bg-canopy"}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const Pill = ({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "ok" | "warn" | "bad" | "gold" }) => {
  const c = { plain: "bg-white/10 text-sand", ok: "bg-olive/25 text-[#d4dd9c]", warn: "bg-gold/20 text-[#e6c677]", bad: "bg-ember/20 text-[#f0a090]", gold: "bg-gold text-night" }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
};
export const Stripe = ({ color }: { color: string }) => <span className="block w-1.5 self-stretch rounded-full" style={{ background: color }} aria-hidden="true" />;
export const PageTitle = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => <header className="mb-5 pt-2"><h1 className="text-4xl font-black leading-tight">{children}</h1>{sub && <p className="mt-1 text-sand/80">{sub}</p>}</header>;
export const Footnote = ({ title, children }: { title: string; children: ReactNode }) => (
  <details className="mt-6 rounded-md border border-sand/20 px-4 py-3 text-sm text-sand/85"><summary className="cursor-pointer font-medium text-sand">{title}</summary><div className="mt-2 space-y-1">{children}</div></details>
);
