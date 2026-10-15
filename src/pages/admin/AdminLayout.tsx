import { NavLink, Outlet } from "react-router-dom";
import { useComp } from "@/lib/comp";
import { Empty, PageTitle } from "@/components/ui";

export default function AdminLayout() {
  const { isAdmin, isOwner, comp } = useComp();
  if (!isAdmin && !isOwner) return <div className="pt-12"><Empty title="Admins only">You don't have admin access to this competition.</Empty></div>;
  const tabs = [["", "Overview"], ["registrations", "Registrations"], ["tribes", "Tribes"], ["fixtures", "Fixtures"], ["results", "Results"], ["announcements", "Announcements"], ["settings", "Settings"], ...(isOwner ? [["competitions", "Competitions"]] : [])];
  return (
    <div>
      <PageTitle sub={comp?.name ?? "No competition selected"}>Admin</PageTitle>
      <nav aria-label="Admin sections" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 pb-1">
        {tabs.map(([to, label]) => <NavLink key={to} to={`/admin${to ? "/" + to : ""}`} end={to === ""} className={({ isActive }) => `shrink-0 rounded-full px-4 py-2.5 text-sm ${isActive ? "bg-parchment font-semibold text-night" : "bg-white/10 text-sand hover:bg-white/15"}`}>{label}</NavLink>)}
      </nav>
      {!comp && !isOwner ? <Empty title="No competition yet" /> : <Outlet />}
    </div>
  );
}
