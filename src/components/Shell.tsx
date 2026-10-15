import { NavLink, Outlet, Link } from "react-router-dom";
import { CalendarDays, Flag, Home, Trophy, UserRound, Settings2 } from "lucide-react";
import { useComp } from "@/lib/comp";
import { useRealtime } from "@/lib/realtime";
import { Loading } from "./ui";

const TABS = [
  { to: "/", label: "Home", Icon: Home, end: true }, { to: "/table", label: "Table", Icon: Trophy },
  { to: "/fixtures", label: "Matches", Icon: CalendarDays }, { to: "/tribes", label: "Tribes", Icon: Flag }, { to: "/me", label: "Me", Icon: UserRound },
];
export default function Shell() {
  const { comp, competitions, setCompId, isAdmin, loading } = useComp();
  useRealtime(comp?.id);
  const link = ({ isActive }: { isActive: boolean }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs md:flex-none md:flex-row md:gap-3 md:rounded-md md:px-3 md:py-2.5 md:text-sm ${isActive ? "text-parchment md:bg-white/10" : "text-sand/70 hover:text-parchment"}`;
  return (
    <div className="min-h-dvh md:pl-56">
      <nav aria-label="Main" className="safe-b fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-night/95 backdrop-blur md:inset-y-0 md:right-auto md:w-56 md:flex-col md:border-r md:border-t-0 md:px-3 md:pt-6">
        <p className="mb-4 hidden px-3 font-display text-2xl font-black md:block">Padel Survivor</p>
        {TABS.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={link}><Icon className="h-5 w-5" aria-hidden />{label}</NavLink>)}
        {isAdmin && <NavLink to="/admin" className={link}><Settings2 className="h-5 w-5" aria-hidden />Admin</NavLink>}
      </nav>
      <div className="mx-auto max-w-2xl px-4 pb-28 md:pb-12">
        {competitions.length > 1 && comp && (
          <div className="safe-t pt-3"><label className="sr-only" htmlFor="compsel">Competition</label>
            <select id="compsel" value={comp.id} onChange={(e) => setCompId(e.target.value)} className="min-h-10 rounded-md border border-sand/30 bg-night px-2 text-sm text-sand">
              {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        )}
        {loading ? <Loading /> : <Outlet />}
      </div>
    </div>
  );
}
export const NotInYet = () => <p className="text-sand/80">You aren't in this competition yet. <Link to="/" className="underline">Go to Home</Link> to join.</p>;
