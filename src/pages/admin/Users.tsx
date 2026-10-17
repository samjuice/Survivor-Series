import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useComp } from "@/lib/comp";
import { useAction, useAdminUsers, useCompAdmins } from "@/lib/data";
import { useToast, Banner, Button, Confirm, Empty, ErrorState, Field, Loading, Pill, inputCls } from "@/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { fmtShortDate } from "@/lib/format";
import type { AdminUser } from "@/types";

export default function Users() {
  const { user } = useAuth(); const { comp, isOwner } = useComp(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const toast = useToast(); const qc = useQueryClient();
  const [all, setAll] = useState(false); const [q, setQ] = useState(""); const [limit, setLimit] = useState(25);
  const users = useAdminUsers(cid, all && isOwner); const admins = useCompAdmins(cid);
  const [sus, setSus] = useState<AdminUser | null>(null); const [del, setDel] = useState<AdminUser | null>(null); const [email, setEmail] = useState(""); const [rm, setRm] = useState<{ user_id: string; full_name: string | null } | null>(null);
  if (!comp && !(all && isOwner)) return <Empty title="No competition yet" />;
  const list = (users.data ?? []).filter((u) => (u.full_name + " " + u.email).toLowerCase().includes(q.toLowerCase()));
  const why = (u: AdminUser) => (u.user_id === user?.id ? "That's you." : u.is_owner ? "The platform owner can't be changed." : undefined);
  const setStatus = async (u: AdminUser, status: "active" | "suspended") => { if (await run("s" + u.user_id, () => supabase.rpc("set_user_status", { p_user: u.user_id, p_status: status }), status === "suspended" ? "Suspended. They can't sign in." : "Restored.")) setSus(null); };
  const remove = async () => {
    const { data, error } = await supabase.rpc("delete_user", { p_user: del!.user_id, p_confirm: true });
    if (error) { toast("error", error.message); return; }
    toast("ok", data === "deleted" ? "Account removed completely." : "Account anonymised. Their match and payment history is kept."); setDel(null); await qc.invalidateQueries({ queryKey: ["c"] });
  };
  return (
    <div className="space-y-8">
      <section className="space-y-3"><h2 className="text-2xl font-black">Users</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Search users" placeholder="Search by name or email" value={q} onChange={(e) => { setQ(e.target.value); setLimit(25); }} className={`${inputCls} max-w-64`} />
          {isOwner && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-fern" checked={all} onChange={(e) => setAll(e.target.checked)} />Everyone on the platform</label>}</div>
        {users.isLoading ? <Loading /> : users.error ? <ErrorState error={users.error} retry={() => users.refetch()} /> : list.length === 0 ? <Empty title="No users found" /> : (
          <ul className="space-y-2">{list.slice(0, limit).map((u) => (
            <li key={u.user_id} className="rounded-md bg-white/[.05] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{u.full_name}{u.display_name ? ` (${u.display_name})` : ""}</p><p className="text-sm text-sand/80">{u.email}</p><p className="text-xs text-sand/70">Joined {fmtShortDate(u.created_at)}, {u.registrations} {u.registrations === 1 ? "registration" : "registrations"}</p></div>
                <div className="flex gap-1.5">{u.is_owner && <Pill tone="gold">Owner</Pill>}<Pill tone={u.status === "active" ? "ok" : u.status === "suspended" ? "warn" : "bad"}>{u.status}</Pill></div></div>
              {u.status !== "deleted" && <div className="mt-3 flex flex-wrap gap-2">
                {u.status === "suspended" ? <Button variant="ghost" busy={busy === "s" + u.user_id} reason={why(u)} onClick={() => setStatus(u, "active")}>Restore access</Button>
                  : <Button variant="ghost" reason={why(u)} onClick={() => setSus(u)}>Suspend</Button>}
                {isOwner && <Button variant="quiet" reason={why(u)} onClick={() => setDel(u)}>Delete</Button>}</div>}
            </li>))}</ul>)}
        {list.length > limit && <Button variant="ghost" onClick={() => setLimit((l) => l + 25)}>Show 25 more</Button>}
      </section>

      <section className="space-y-3"><h2 className="text-2xl font-black">Admins of this competition</h2>
        <p className="text-sm text-sand/80">The platform owner is an admin everywhere. Admins can approve players, enter scores and run the series, but can't create competitions or delete users.</p>
        {admins.isLoading ? <Loading /> : (admins.data ?? []).length === 0 ? <p className="text-sand/80">No extra admins yet.</p> : <ul className="space-y-1.5">{admins.data!.map((a) => <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/[.05] px-3.5 py-2.5"><span>{a.full_name ?? "Admin"} <span className="text-sm text-sand/70">{a.email}</span></span>{isOwner && <Button variant="quiet" onClick={() => setRm(a)}>Remove</Button>}</li>)}</ul>}
        {isOwner ? (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run("addadmin", () => supabase.rpc("add_competition_admin", { p_competition: comp!.id, p_email: email }), "Admin added.").then((ok) => { if (ok) setEmail(""); }); }}>
            <Field label="Add an admin by email" hint="They must already have signed up and finished their profile.">{(id, d) => <input id={id} aria-describedby={d} type="email" className={`${inputCls} max-w-80`} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <Button type="submit" busy={busy === "addadmin"} reason={!email.includes("@") ? "Enter their email address." : undefined}>Add admin</Button></form>
        ) : <Banner tone="info">Only the platform owner can add or remove admins.</Banner>}
      </section>

      <Confirm open={!!sus} title={`Suspend ${sus?.full_name}?`} body="They are signed out of the app and can't sign in until you restore access. Their results and registrations stay." confirmLabel="Suspend" danger busy={busy === "s" + sus?.user_id} onClose={() => setSus(null)} onConfirm={() => setStatus(sus!, "suspended")} />
      <Confirm open={!!del} title={`Delete ${del?.full_name}?`} body={<>If they have no history the account is removed completely. If they have registrations, results or payments, the account is <b>anonymised</b> instead: their name and email are wiped and they can't sign in, but the history stays intact. A player on a tribe must be replaced first.</>} confirmLabel="Delete" danger onClose={() => setDel(null)} onConfirm={remove} />
      <Confirm open={!!rm} title={`Remove ${rm?.full_name ?? "this admin"}?`} body="They lose admin access to this competition straight away." confirmLabel="Remove admin" danger busy={busy === "rmadmin"} onClose={() => setRm(null)} onConfirm={async () => { if (await run("rmadmin", () => supabase.rpc("remove_competition_admin", { p_competition: comp!.id, p_user: rm!.user_id }), "Admin removed.")) setRm(null); }} />
    </div>
  );
}
