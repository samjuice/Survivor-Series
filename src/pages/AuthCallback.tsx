import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loading, Button } from "@/components/ui";

// Landing page for the confirmation link. If the link was opened in a different browser
// the email is still confirmed, but there is no session here, so we say so plainly.
export default function AuthCallback() {
  const nav = useNavigate();
  const [state, setState] = useState<"working" | "confirmed-elsewhere" | "expired">("working");
  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
    const err = qs.get("error_description") ?? qs.get("error");
    (async () => {
      for (let i = 0; i < 12 && live; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { nav("/", { replace: true }); return; }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (live) setState(err && /expired|invalid/i.test(err) ? "expired" : "confirmed-elsewhere");
    })();
    return () => { live = false; };
  }, [nav]);
  if (state === "working") return <div className="grid min-h-dvh place-items-center"><Loading label="Confirming your email" /></div>;
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-black">{state === "expired" ? "That link has expired" : "Email confirmed"}</h1>
        <p className="text-sand/90">{state === "expired" ? "Links work once and only the newest one counts. Sign in and use Resend confirmation email to get a fresh one." : "You opened the link on a different browser or device, so sign in here to continue."}</p>
        <Link to="/login"><Button>Go to sign in</Button></Link>
      </div>
    </main>
  );
}
