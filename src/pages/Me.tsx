import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useAction } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { Banner, Button, Field, PageTitle, Pill, inputCls } from "@/components/ui";

export default function MePage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { isAdmin, isOwner, comp } = useComp(); const me = useMe();
  const { run, busy } = useAction(comp?.id);
  const [name, setName] = useState(profile?.full_name ?? ""); const [nick, setNick] = useState(profile?.display_name ?? "");
  const dirty = name.trim() !== (profile?.full_name ?? "") || nick.trim() !== (profile?.display_name ?? "");
  const save = async () => { if (await run("profile", () => supabase.from("profiles").update({ full_name: name.trim(), display_name: nick.trim() || null }).eq("id", user!.id), "Profile saved.")) await refreshProfile(); };
  return (
    <div>
      <PageTitle sub={user?.email}>Me</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">{isOwner && <Pill tone="gold">Platform owner</Pill>}{isAdmin && !isOwner && <Pill tone="ok">Admin</Pill>}{me.isCaptain && <Pill tone="ok">Captain</Pill>}{me.myTeam && <Pill>{me.myTeam.name}</Pill>}</div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Full name">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Nickname" hint="Optional. Shown instead of your full name on rosters.">{(id, d) => <input id={id} aria-describedby={d} className={inputCls} value={nick} onChange={(e) => setNick(e.target.value)} />}</Field>
        <Button type="submit" busy={busy === "profile"} reason={name.trim().length < 2 ? "Enter your full name." : !dirty ? "Nothing has changed yet." : undefined}>Save changes</Button>
      </form>
      {isAdmin && <div className="mt-8"><Link to="/admin" className="inline-block min-h-11 py-2 underline">Open the admin area</Link></div>}
      <div className="mt-8"><Banner tone="info" title="Install this app">On your phone, open the browser menu and choose Add to Home Screen. It then opens like any other app.</Banner></div>
      <div className="mt-8"><Button variant="ghost" onClick={() => signOut()}>Sign out</Button></div>
    </div>
  );
}
