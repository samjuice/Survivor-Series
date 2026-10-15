import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendly, useAction } from "@/lib/data";
import { setsWon, validateSets, type SetInput } from "@/lib/scores";
import { Banner, Button, Footnote, inputCls } from "./ui";
import type { Fixture, Team } from "@/types";

const BLANK: SetInput[] = [{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }];
export default function ScoreForm({ fixture, teamA, teamB, isAdmin, onDone }: { fixture: Fixture; teamA?: Team; teamB?: Team; isAdmin: boolean; onDone?: () => void }) {
  const { run, busy } = useAction(fixture.competition_id);
  const [sets, setSets] = useState<SetInput[]>(BLANK);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const v = useMemo(() => validateSets(sets), [sets]);
  const upd = (i: number, k: "a" | "b", val: string) => { setSets((s) => s.map((x, j) => (j === i ? { ...x, [k]: val.replace(/\D/g, "").slice(0, 1) } : x))); setServerError(null); };
  const [wa, wb] = v.parsed ? setsWon(v.parsed) : [0, 0];

  async function submit() {
    setTouched(true); setServerError(null);
    if (!v.ok || !v.parsed) return;
    let message: string | null = null;
    const ok = await run("score", async () => { const r = await supabase.rpc("submit_result", { p_fixture: fixture.id, p_sets: v.parsed }); if (r.error) message = friendly(r.error.message); return r; },
      isAdmin ? "Result saved and approved." : "Result sent. An admin will approve it.");
    if (ok) { setSets(BLANK); setTouched(false); onDone?.(); } else if (message) setServerError(message);
  }
  const names = [teamA?.name ?? "Team A", teamB?.name ?? "Team B"];
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4" noValidate>
      {(serverError || (touched && !v.ok)) && <Banner tone="error" title="This result can't be saved yet">{serverError ?? v.matchError}</Banner>}
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-x-3 gap-y-1">
        <span />
        <span className="truncate text-center text-sm font-semibold">{names[0]}</span>
        <span className="truncate text-center text-sm font-semibold">{names[1]}</span>
        {sets.map((s, i) => (
          <div key={i} className="contents">
            <label className="py-1 font-display text-lg font-bold" htmlFor={`s${i}a`}>Set {i + 1}</label>
            <input id={`s${i}a`} inputMode="numeric" aria-label={`Set ${i + 1}, ${names[0]} games`} aria-invalid={touched && !!v.setErrors[i]} value={s.a} onChange={(e) => upd(i, "a", e.target.value)} className={`${inputCls} num text-center text-xl font-bold`} />
            <input inputMode="numeric" aria-label={`Set ${i + 1}, ${names[1]} games`} aria-invalid={touched && !!v.setErrors[i]} value={s.b} onChange={(e) => upd(i, "b", e.target.value)} className={`${inputCls} num text-center text-xl font-bold`} />
            {touched && v.setErrors[i] && <p className="col-span-3 mb-1 text-xs text-ember" role="alert">Set {i + 1}: {v.setErrors[i]}</p>}
          </div>
        ))}
      </div>
      {v.ok && <p className="text-sand/90">That's <b>{wa > wb ? names[0] : names[1]}</b> winning {Math.max(wa, wb)} sets to {Math.min(wa, wb)}.</p>}
      <Button type="submit" block busy={busy === "score"}>{isAdmin ? "Save and approve result" : "Send result for approval"}</Button>
      <Footnote title="How scores work">
        <p>Every match is exactly 3 sets, and all 3 count towards set and game difference.</p>
        <p>A set ends 6-0 to 6-4, or 7-5, or 7-6 (enter a tiebreak as 7-6). Nothing goes above 7 and sets can't end level.</p>
        <p>Enter each tribe's games in its own column. The winner is worked out for you.</p>
        <p>Walkovers are recorded by an admin as 6-0, 6-0, 6-0.</p>
      </Footnote>
    </form>
  );
}
