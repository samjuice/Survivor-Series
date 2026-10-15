import { useState } from "react";
import { useComp } from "@/lib/comp";
import { useAction, useAnnouncements } from "@/lib/data";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { Button, Confirm, Empty, ErrorState, Field, Loading, Pill, inputCls } from "@/components/ui";

export default function Announcements() {
  const { comp } = useComp(); const { user } = useAuth(); const cid = comp?.id; const { run, busy } = useAction(cid);
  const anns = useAnnouncements(cid);
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [pin, setPin] = useState(false); const [del, setDel] = useState<string | null>(null);
  if (!comp) return <Empty title="No competition yet" />;
  const post = async () => { if (await run("post", () => supabase.from("announcements").insert({ competition_id: comp.id, title: title.trim(), body: body.trim(), pinned: pin, created_by: user!.id }), "Announcement posted.")) { setTitle(""); setBody(""); setPin(false); } };
  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); post(); }}>
        <h2 className="text-2xl font-black">New announcement</h2>
        <Field label="Title">{(id) => <input id={id} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Message">{(id) => <textarea id={id} rows={4} className={`${inputCls} py-2`} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-fern" checked={pin} onChange={(e) => setPin(e.target.checked)} />Pin to the top</label>
        <Button type="submit" busy={busy === "post"} reason={!title.trim() ? "Add a title." : undefined}>Post announcement</Button>
      </form>
      {anns.isLoading ? <Loading /> : anns.error ? <ErrorState error={anns.error} retry={() => anns.refetch()} /> : (anns.data ?? []).length === 0 ? <Empty title="Nothing posted yet">Players see announcements on their home screen.</Empty> : (
        <ul className="space-y-2">{anns.data!.map((a) => (
          <li key={a.id} className="rounded-md bg-white/[.05] p-3.5"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{a.title}</p>{a.pinned && <Pill tone="gold">Pinned</Pill>}</div>
            {a.body && <p className="mt-1 whitespace-pre-line text-sm text-sand/90">{a.body}</p>}<p className="mt-1 text-xs text-sand/70">{fmtDateTime(a.created_at)}</p>
            <div className="mt-3 flex gap-2"><Button variant="ghost" busy={busy === a.id} onClick={() => run(a.id, () => supabase.from("announcements").update({ pinned: !a.pinned }).eq("id", a.id), a.pinned ? "Unpinned." : "Pinned.")}>{a.pinned ? "Unpin" : "Pin"}</Button><Button variant="ghost" onClick={() => setDel(a.id)}>Delete</Button></div></li>))}</ul>)}
      <Confirm open={!!del} title="Delete this announcement?" body="Players will no longer see it." confirmLabel="Delete" danger busy={busy === "del"} onClose={() => setDel(null)} onConfirm={async () => { if (await run("del", () => supabase.from("announcements").delete().eq("id", del!), "Deleted.")) setDel(null); }} />
    </div>
  );
}
