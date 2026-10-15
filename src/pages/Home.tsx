import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useComp } from "@/lib/comp";
import { useMe } from "@/lib/me";
import { useAction, useAnnouncements, useFeed, useFixtures, usePaymentInfo, usePrizePool, useResults, useTeams, teamById } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { fmtDate, fmtDateTime, fmtRand, PHASE_LABEL } from "@/lib/format";
import Topo from "@/components/Topo";
import Pennant from "@/components/Pennant";
import Countdown from "@/components/Countdown";
import FeedList from "@/components/FeedList";
import { TeamBadge } from "@/components/TeamBadge";
import { Banner, Button, Confirm, Empty, ErrorState, Loading, Pill } from "@/components/ui";
import { useState } from "react";

export default function Home() {
  const { user } = useAuth();
  const { comp, isAdmin, isOwner } = useComp();
  const me = useMe();
  const cid = comp?.id;
  const { run, busy } = useAction(cid);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const teams = useTeams(cid); const fixtures = useFixtures(cid); const results = useResults(cid);
  const anns = useAnnouncements(cid); const feed = useFeed(cid);
  const hasReg = !!me.reg && ["pending", "approved", "waitlisted"].includes(me.reg.status);
  const pay = usePaymentInfo(cid, hasReg); const prize = usePrizePool(cid, me.reg?.status === "approved" || isAdmin);

  if (!comp) {
    return <div className="pt-12"><Empty title="No competition is open yet" action={isOwner ? <Link to="/admin/competitions"><Button>Create the first competition</Button></Link> : undefined}>An organiser will open registration soon. This page updates by itself.</Empty></div>;
  }
  if (me.loading || teams.isLoading) return <Loading />;
  if (teams.error) return <ErrorState error={teams.error} retry={() => teams.refetch()} />;

  const myFixtures = (fixtures.data ?? []).filter((f) => me.myTeam && (f.team_a === me.myTeam.id || f.team_b === me.myTeam.id));
  const next = myFixtures.filter((f) => f.status === "scheduled").sort((a, b) => (a.scheduled_at ?? "9").localeCompare(b.scheduled_at ?? "9") || a.round - b.round)[0];
  const lastRes = (results.data ?? []).filter((r) => r.status === "approved" && myFixtures.some((f) => f.id === r.fixture_id)).sort((a, b) => (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? ""))[0];
  const lastFix = lastRes ? myFixtures.find((f) => f.id === lastRes.fixture_id) : undefined;
  const target = next?.scheduled_at ? { to: new Date(next.scheduled_at), label: "until your next match" } : comp.phase === "registration" && comp.starts_on ? { to: new Date(comp.starts_on + "T08:00:00+02:00"), label: "until the series starts" } : comp.completion_target ? { to: new Date(comp.completion_target + "T18:00:00+02:00"), label: "until the series closes" } : null;
  const pinned = (anns.data ?? []).slice(0, 4);
  const join = () => run("join", () => supabase.from("registrations").insert({ competition_id: comp.id, user_id: user!.id }), "You're on the list. An admin will confirm your place.");
  const leave = async () => { if (await run("leave", () => supabase.from("registrations").update({ status: "withdrawn" }).eq("id", me.reg!.id), "Registration withdrawn.")) setConfirmLeave(false); };
  const revealedTeam = me.myTeam && (me.myTeam.revealed || isAdmin) ? me.myTeam : undefined;

  return (
    <div>
      <section className="relative -mx-4 overflow-hidden bg-canopy px-5 pb-9 pt-10 safe-t md:mx-0 md:rounded-b-3xl">
        <Topo className="absolute inset-0 h-full w-full text-olive/25" />
        <div className="relative">
          <div className="mb-5 flex flex-wrap items-center gap-2"><Pill tone={comp.phase === "completed" ? "gold" : "ok"}>{PHASE_LABEL[comp.phase]}</Pill>{comp.phase === "draft" && <Pill tone="warn">Only admins can see this</Pill>}</div>
          <h1 className="max-w-md text-5xl font-black leading-[.95]">{comp.name}</h1>
          {comp.completion_target && <p className="mt-3 text-sand/90">Finishing {fmtDate(comp.completion_target)}</p>}
          {revealedTeam && <div className="mt-8"><Pennant name={revealedTeam.name} color={revealedTeam.color} emblem={revealedTeam.emblem_key} /></div>}
          {target && <div className="mt-8"><Countdown to={target.to} label={target.label} /></div>}
          {prize.data != null && <p className="mt-6 text-sand/90">Prize pool <b className="num font-display text-2xl text-parchment">{fmtRand(prize.data)}</b></p>}
        </div>
      </section>

      <div className="mt-6 space-y-8">
        {!me.reg && (
          <section className="space-y-3"><h2 className="text-2xl font-black">Join the series</h2>
            {comp.phase === "registration"
              ? <><p className="text-sand/90">Entry is {fmtRand(comp.entry_fee_cents)}, paid by EFT. An admin confirms your payment by hand and approves your place.</p><Button busy={busy === "join"} onClick={join}>Join the series</Button></>
              : <Banner tone="info">Registration isn't open{isAdmin ? "" : ". You'll see it here when it is."}</Banner>}
          </section>
        )}
        {me.reg && (
          <section className="space-y-3"><h2 className="text-2xl font-black">Your place</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={me.reg.status === "approved" ? "ok" : me.reg.status === "pending" || me.reg.status === "waitlisted" ? "warn" : "bad"}>{{ approved: "Approved", pending: "Waiting for approval", waitlisted: "On the waitlist", rejected: "Not accepted", withdrawn: "Withdrawn" }[me.reg.status]}</Pill>
              <Pill tone={me.reg.payment_status === "paid" ? "ok" : "warn"}>{me.reg.payment_status === "paid" ? "Payment confirmed" : "Payment not confirmed yet"}</Pill>
            </div>
            {me.reg.payment_status === "unpaid" && hasReg && (
              <div className="rounded-md bg-white/5 p-4"><p className="font-medium">Pay {fmtRand(comp.entry_fee_cents)} by EFT</p>
                {pay.data ? <p className="mt-1 whitespace-pre-line text-sand/90">{pay.data}</p> : <p className="mt-1 text-sand/80">The organiser hasn't added bank details yet. Ask them directly.</p>}
                <p className="mt-2 text-xs text-sand/70">Payments are confirmed manually, so it can take a little while to show here.</p></div>)}
            {me.reg.status === "approved" && !me.myTeam && <p className="text-sand/90">You're in. Your tribe is announced at the reveal.</p>}
            {me.reg.status === "approved" && me.myTeam && !me.myTeam.revealed && !isAdmin && <p className="text-sand/90">You've been placed on a tribe. It stays secret until the reveal.</p>}
            {["pending", "waitlisted"].includes(me.reg.status) && <Button variant="ghost" onClick={() => setConfirmLeave(true)}>Withdraw my registration</Button>}
          </section>
        )}

        {revealedTeam && (
          <section className="space-y-3"><h2 className="text-2xl font-black">Your next match</h2>
            {next ? <Link to={`/match/${next.id}`} className="flex items-center justify-between gap-3 rounded-md bg-white/5 p-4 hover:bg-white/10">
              <div><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><TeamBadge team={teamById(teams.data, next.team_a)} size="sm" /><span className="text-sand/70">v</span><TeamBadge team={teamById(teams.data, next.team_b)} size="sm" /></div>
                <p className="mt-2 text-sm text-sand/90">{next.scheduled_at ? fmtDateTime(next.scheduled_at) : "Time to be confirmed"}</p><p className="text-sm text-sand/70">Round {next.round}</p></div>
              <span className="text-sm underline">Open</span></Link>
              : <p className="text-sand/90">{myFixtures.length ? "You've played every scheduled match." : "Fixtures aren't out yet."}</p>}
          </section>
        )}

        {lastRes && lastFix && (
          <section className="space-y-3"><h2 className="text-2xl font-black">Latest result</h2>
            <Link to={`/match/${lastFix.id}`} className="block rounded-md bg-white/5 p-4 hover:bg-white/10">
              <p className="font-display text-lg font-bold">{teamById(teams.data, lastRes.winner_team)?.name} won</p>
              <p className="text-sand/90">{teamById(teams.data, lastFix.team_a)?.name} v {teamById(teams.data, lastFix.team_b)?.name}</p>{lastRes.walkover && <Pill tone="warn">Walkover</Pill>}
              <p className="num mt-1 text-sand">{[...lastRes.result_sets].sort((a, b) => a.set_no - b.set_no).map((s) => `${s.a_games}-${s.b_games}`).join("   ")}</p></Link>
          </section>
        )}

        {pinned.length > 0 && (
          <section className="space-y-3"><h2 className="text-2xl font-black">Announcements</h2>
            {pinned.map((a) => <article key={a.id} className="rounded-md bg-white/5 p-4"><div className="flex items-start justify-between gap-2"><h3 className="text-lg font-bold">{a.title}</h3>{a.pinned && <Pill tone="gold">Pinned</Pill>}</div>{a.body && <p className="mt-1 whitespace-pre-line text-sand/90">{a.body}</p>}<p className="mt-2 text-xs text-sand/70">{fmtDateTime(a.created_at)}</p></article>)}
          </section>
        )}

        {(feed.data?.length ?? 0) > 0 && <section className="space-y-3"><h2 className="text-2xl font-black">What's happening</h2><FeedList events={feed.data!} /></section>}
        {isAdmin && <Link to="/admin" className="inline-block min-h-11 py-2 underline">Open the admin area</Link>}
      </div>
      <Confirm open={confirmLeave} title="Withdraw your registration?" body="You will lose your place. You can't register again without asking an admin." confirmLabel="Withdraw" danger busy={busy === "leave"} onConfirm={leave} onClose={() => setConfirmLeave(false)} />
    </div>
  );
}
