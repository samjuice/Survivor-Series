import { useEffect, useState } from "react";
import { countdown } from "@/lib/format";
export default function Countdown({ to, label }: { to: Date; label: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const c = countdown(to, now);
  if (c.done) return null;
  const cell = (n: number, u: string) => <div className="min-w-14"><div className="num font-display text-4xl font-black leading-none">{String(n).padStart(2, "0")}</div><div className="mt-1 text-xs text-sand/80">{u}</div></div>;
  return (
    <div role="timer" aria-label={`${c.days} days ${c.hours} hours ${c.minutes} minutes ${label}`}>
      <div className="flex gap-3">{cell(c.days, "days")}{cell(c.hours, "hours")}{cell(c.minutes, "min")}{c.days === 0 && cell(c.seconds, "sec")}</div>
      <p className="mt-2 text-sm text-sand/90">{label}</p>
    </div>
  );
}
