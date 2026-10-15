import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Banner, Button, Field, Loading, inputCls } from "@/components/ui";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState<"checking" | "yes" | "no">("checking");
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      for (let i = 0; i < 12 && live; i++) { const { data } = await supabase.auth.getSession(); if (data.session) { setReady("yes"); return; } await new Promise((r) => setTimeout(r, 400)); }
      if (live) setReady("no");
    })();
    return () => { live = false; };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (pw.length < 8) { setError("Choose a password with at least 8 characters."); return; }
    setBusy(true); const { error: err } = await supabase.auth.updateUser({ password: pw }); setBusy(false);
    if (err) setError(err.message); else nav("/", { replace: true });
  }
  if (ready === "checking") return <div className="grid min-h-dvh place-items-center"><Loading /></div>;
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6">
      {ready === "no" ? (
        <div className="space-y-4 text-center"><h1 className="text-4xl font-black">Reset link not valid</h1><p className="text-sand/90">It may have expired, or it was opened on a different browser. Request a new one.</p><Link to="/login"><Button>Back to sign in</Button></Link></div>
      ) : (
        <form onSubmit={submit} className="w-full space-y-4"><h1 className="text-4xl font-black">Choose a new password</h1>
          {error && <Banner tone="error">{error}</Banner>}
          <Field label="New password" hint="At least 8 characters.">{(id, d) => <input id={id} aria-describedby={d} type="password" className={inputCls} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <Button type="submit" block busy={busy} reason={!pw ? "Enter a new password to continue." : undefined}>Save password</Button></form>
      )}
    </main>
  );
}
