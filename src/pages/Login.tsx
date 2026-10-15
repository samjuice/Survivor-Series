import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import Topo from "@/components/Topo";
import { Banner, Button, Field, inputCls } from "@/components/ui";

type Mode = "in" | "up" | "forgot" | "sent" | "reset-sent";
const redirectTo = () => `${window.location.origin}/auth/callback`;

export default function Login() {
  const { status } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [unconfirmed, setUnconfirmed] = useState(false);
  const [cooldown, setCooldown] = useState(0); const [resent, setResent] = useState(false);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  if (status === "in") return <Navigate to={(loc.state as { from?: string } | null)?.from ?? "/"} replace />;

  const switchMode = (m: Mode) => { setMode(m); setError(null); setUnconfirmed(false); setResent(false); };
  async function resend() {
    setError(null); setBusy(true);
    const { error: e } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (e) setError(/rate|seconds/i.test(e.message) ? "You asked for an email a moment ago. Wait a minute, then try again." : e.message);
    else { setResent(true); setCooldown(60); }
  }
  async function submit(ev: FormEvent) {
    ev.preventDefault(); setError(null); setUnconfirmed(false); setBusy(true);
    try {
      const mail = email.trim();
      if (mode === "in") {
        const { error: e } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (e) {
          if (/not confirmed/i.test(e.message)) { setUnconfirmed(true); setError("Your email isn't confirmed yet. Open the link we sent, or send it again."); }
          else if (/invalid login/i.test(e.message)) setError("That email and password don't match. Check them, or reset your password.");
          else setError(e.message);
        } else nav("/", { replace: true });
      } else if (mode === "up") {
        if (password.length < 8) { setError("Choose a password with at least 8 characters."); return; }
        const { data, error: e } = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: redirectTo(), data: { full_name: name.trim() } } });
        if (e) setError(/already registered/i.test(e.message) ? "That email already has an account. Sign in, or reset your password." : /rate|seconds/i.test(e.message) ? "Too many attempts. Wait a minute and try again." : e.message);
        else if (data.user && data.user.identities?.length === 0) setError("That email already has an account. Sign in, or reset your password.");
        else if (data.session) nav("/", { replace: true });
        else { setMode("sent"); setCooldown(60); }
      } else if (mode === "forgot") {
        await supabase.auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/reset-password` });
        setMode("reset-sent"); // same message whether or not the account exists
      }
    } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <section className="safe-t relative overflow-hidden bg-canopy px-6 pb-10 pt-12 md:flex md:flex-col md:justify-end md:pb-16">
        <Topo className="absolute inset-0 h-full w-full text-olive/25" />
        <div className="relative">
          <p className="text-sand">The Padel Series</p>
          <h1 className="text-7xl font-black leading-[.9] md:text-8xl">Survivor</h1>
          <p className="mt-4 max-w-xs text-lg text-sand/90">Tribes, tactics and tennis-court politics. Sign in to see your tribe.</p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-md px-6 py-10 md:self-center">
        {mode === "sent" || mode === "reset-sent" ? (
          <div className="space-y-4">
            <h2 className="text-3xl font-black">{mode === "sent" ? "Check your inbox" : "Reset link sent"}</h2>
            <p className="text-sand/90">{mode === "sent" ? <>We sent a confirmation link to <b>{email.trim()}</b>. Open it on any device, then sign in here.</> : <>If <b>{email.trim()}</b> has an account, a reset link is on its way.</>}</p>
            {error && <Banner tone="error">{error}</Banner>}
            {resent && <Banner tone="ok">Sent again. Only the newest link works.</Banner>}
            {mode === "sent" && <Button variant="ghost" busy={busy} reason={cooldown > 0 ? `You can send it again in ${cooldown}s.` : undefined} onClick={resend}>Resend confirmation email</Button>}
            <div><Button variant="quiet" onClick={() => switchMode("in")}>Back to sign in</Button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <h2 className="text-3xl font-black">{mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset your password"}</h2>
            {error && <Banner tone="error">{error}</Banner>}
            {resent && <Banner tone="ok">Confirmation email sent again. Only the newest link works.</Banner>}
            {mode === "up" && <Field label="Your full name" hint="Shown to your tribe and on results.">{(id, d) => <input id={id} aria-describedby={d} className={inputCls} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />}</Field>}
            <Field label="Email">{(id) => <input id={id} type="email" className={inputCls} autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
            {mode !== "forgot" && <Field label="Password" hint={mode === "up" ? "At least 8 characters." : undefined}>{(id, d) => <input id={id} aria-describedby={d} type="password" className={inputCls} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>}
            <Button type="submit" block busy={busy} reason={!email.trim() ? "Enter your email to continue." : mode !== "forgot" && !password ? "Enter your password to continue." : mode === "up" && !name.trim() ? "Enter your name to continue." : undefined}>
              {mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
            </Button>
            {unconfirmed && <Button variant="ghost" block busy={busy} reason={cooldown > 0 ? `You can send it again in ${cooldown}s.` : undefined} onClick={resend}>Resend confirmation email</Button>}
            <div className="flex flex-wrap justify-between gap-2 pt-1 text-sm">
              {mode === "in" ? <><button type="button" className="min-h-11 text-sand underline" onClick={() => switchMode("up")}>New here? Create an account</button><button type="button" className="min-h-11 text-sand underline" onClick={() => switchMode("forgot")}>Forgot password</button></>
                : <button type="button" className="min-h-11 text-sand underline" onClick={() => switchMode("in")}>I already have an account</button>}
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
