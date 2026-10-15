import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Banner, Button, Field, Loading, inputCls } from "@/components/ui";

// Works with no saved sign-up data: the name is simply asked for here.
export default function CompleteProfile() {
  const { status, user, profile, profileLoading, refreshProfile, signOut } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(() => String((user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? ""));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  if (status === "loading" || profileLoading) return <div className="grid min-h-dvh place-items-center"><Loading /></div>;
  if (status === "out") return <Navigate to="/login" replace />;
  if (profile) return <Navigate to="/" replace />;
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (name.trim().length < 2) { setError("Enter your full name (at least 2 letters)."); return; }
    setBusy(true);
    const { error: err } = await supabase.from("profiles").insert({ id: user!.id, full_name: name.trim() });
    if (err && !/duplicate/i.test(err.message)) { setBusy(false); setError(err.message); return; }
    await refreshProfile(); setBusy(false); nav("/", { replace: true });
  }
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6">
      <form onSubmit={submit} className="w-full space-y-4">
        <h1 className="text-4xl font-black">One last step</h1>
        <p className="text-sand/90">Tell us your name so your tribe and the organisers know who you are.</p>
        {error && <Banner tone="error">{error}</Banner>}
        <Field label="Full name">{(id) => <input id={id} className={inputCls} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Button type="submit" block busy={busy} reason={name.trim().length < 2 ? "Enter your full name to continue." : undefined}>Save and continue</Button>
        <div className="text-center"><button type="button" className="min-h-11 text-sm text-sand underline" onClick={() => signOut()}>Sign out</button></div>
      </form>
    </main>
  );
}
