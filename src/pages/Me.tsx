import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useAction, usePrefs } from "@/lib/data";
import { useQueryClient } from "@tanstack/react-query";
import type { Prefs } from "@/types";
import { supabase } from "@/lib/supabase";
import { Banner, Button, Field, PageTitle, Pill, inputCls } from "@/components/ui";

const PREF_LABELS: [keyof Prefs, string, string][] = [["results", "Results", "When a result is approved or an Americano finishes."], ["fixtures", "Matches", "When fixtures are published, rebuilt or given a time."], ["announcements", "Announcements", "When an organiser posts something."], ["reveals", "Reveals and awards", "When a tribe is revealed or awards are announced."]];
function NotificationPrefs() {
  const { user } = useAuth(); const prefs = usePrefs(user?.id); const qc = useQueryClient(); const { run } = useAction();
  const set = async (k: keyof Prefs, v: boolean) => {
    const next = { ...(prefs.data as Prefs), [k]: v };
    if (await run("pref" + k, () => supabase.from("notification_prefs").upsert({ user_id: user!.id, ...next, updated_at: new Date().toISOString() }))) await qc.invalidateQueries({ queryKey: ["prefs", user?.id] });
  };
  return (
    <section className="mt-8"><h2 className="text-2xl font-black">Notifications</h2>
      <p className="mb-2 text-sm text-sand/80">Pop-ups while the app is open. Push and email notifications aren't available yet.</p>
      <ul className="space-y-1">{PREF_LABELS.map(([k, label, hint]) => (
        <li key={k}><label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-fern" disabled={!prefs.data} checked={prefs.data?.[k] ?? true} onChange={(e) => set(k, e.target.checked)} /><span><span className="block font-medium">{label}</span><span className="block text-sm text-sand/80">{hint}</span></span></label></li>))}</ul>
    </section>
  );
}
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
      <NotificationPrefs />
      {isAdmin && <div className="mt-8"><Link to="/admin" className="inline-block min-h-11 py-2 underline">Open the admin area</Link></div>}
      <div className="mt-8"><Banner tone="info" title="Install this app">On your phone, open the browser menu and choose Add to Home Screen. It then opens like any other app.</Banner></div>
      <div className="mt-8"><Button variant="ghost" onClick={() => signOut()}>Sign out</Button></div>
    </div>
  );
}
