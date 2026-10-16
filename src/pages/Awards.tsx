import { useState } from "react";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useAction, useAwards, useMyVotes, useNominees, useWinners } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { Emblem, tribeColor } from "@/components/Emblems";
import { Banner, Button, Empty, ErrorState, Loading, PageTitle, Pill, inputCls } from "@/components/ui";
import type { Award } from "@/types";

function VoteCard({ award, cid, ownReg, ownTeam }: { award: Award; cid: string; ownReg?: string; ownTeam?: string }) {
  const nominees = useNominees(cid); const mine = useMyVotes(cid); const { run, busy } = useAction(cid);
  const options = (nominees.data ?? []).filter((n) => n.award_id === award.id && n.nominee_id !== ownReg && n.nominee_id !== ownTeam);
  const current = mine.data?.find((v) => v.award_id === award.id)?.nominee_id;
  const [sel, setSel] = useState("");
  const cur = (nominees.data ?? []).find((n) => n.award_id === award.id && n.nominee_id === current);
  return (
    <section className="rounded-md bg-white/[.05] p-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-black">{award.title}</h3><Pill tone="ok">Voting open</Pill></div>
      {award.description && <p className="mt-1 text-sand/90">{award.description}</p>}
      {cur && <p className="mt-3 text-sm">Your vote: <b>{cur.name}</b></p>}
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <select aria-label={`Nominee for ${award.title}`} className={`${inputCls} max-w-64`} value={sel} onChange={(e) => setSel(e.target.value)}><option value="">{current ? "Change your vote..." : award.nominee_kind === "tribe" ? "Choose a tribe..." : "Choose a player..."}</option>{options.map((o) => <option key={o.nominee_id} value={o.nominee_id}>{o.name}</option>)}</select>
        <Button busy={busy === award.id} reason={!sel ? "Choose who to vote for." : undefined} onClick={async () => { if (await run(award.id, () => supabase.rpc("cast_vote", { p_award: award.id, p_nominee: sel }), "Vote saved.")) setSel(""); }}>{current ? "Change vote" : "Vote"}</Button>
      </div>
      <p className="mt-2 text-xs text-sand/70">{award.nominee_kind === "tribe" ? "You can't vote for your own tribe." : "You can't vote for yourself."} Votes are secret and never change points.</p>
    </section>
  );
}
export default function AwardsPage() {
  const { comp } = useComp(); const me = useMe(); const cid = comp?.id;
  const awards = useAwards(cid); const winners = useWinners(cid);
  if (!comp) return <Empty title="No competition yet" />;
  if (awards.isLoading || winners.isLoading) return <Loading />;
  if (awards.error) return <ErrorState error={awards.error} retry={() => awards.refetch()} />;
  const open = (awards.data ?? []).filter((a) => a.voting_open); const won = (winners.data ?? []).filter((w) => w.published);
  return (
    <div>
      <PageTitle sub="Awards never change points or the table.">Awards</PageTitle>
      {won.length === 0 && open.length === 0 && <Empty title="No awards yet">Voting and winners show up here when the organisers open them.</Empty>}
      {won.length > 0 && <section className="mb-8 space-y-3"><h2 className="text-2xl font-black">The winners</h2>
        {won.map((w) => (<article key={w.award_id} className="flex items-center gap-4 rounded-md border border-gold/50 bg-gold/10 p-4">
          {w.nominee_kind === "tribe" && <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full p-3 text-parchment" style={{ background: tribeColor(w.color) }}><Emblem k={w.emblem_key} className="h-full w-full" /></span>}
          <div><p className="text-sm text-sand/90">{w.title}</p><p className="font-display text-3xl font-black text-gold">{w.winner_name}</p>{w.description && <p className="text-sm text-sand/80">{w.description}</p>}</div></article>))}</section>}
      {open.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-black">Vote now</h2>
        {!me.reg || me.reg.status !== "approved" ? <Banner tone="info">Only approved players can vote.</Banner> : open.map((a) => <VoteCard key={a.id} award={a} cid={comp.id} ownReg={me.reg?.id} ownTeam={me.myTeam?.id} />)}</section>}
    </div>
  );
}
