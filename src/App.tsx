import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { CompProvider } from "@/lib/comp";
import Shell from "@/components/Shell";
import { Loading } from "@/components/ui";

const Login = lazy(() => import("@/pages/Login"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const CompleteProfile = lazy(() => import("@/pages/CompleteProfile"));
const HomePage = lazy(() => import("@/pages/Home"));
const TablePage = lazy(() => import("@/pages/Table"));
const FixturesPage = lazy(() => import("@/pages/Fixtures"));
const MatchPage = lazy(() => import("@/pages/Match"));
const TribesPage = lazy(() => import("@/pages/Tribes"));
const MePage = lazy(() => import("@/pages/Me"));
const AdminLayout = lazy(() => import("@/pages/admin/AdminLayout"));
const AdminOverview = lazy(() => import("@/pages/admin/Overview"));
const AdminRegistrations = lazy(() => import("@/pages/admin/Registrations"));
const AdminTribes = lazy(() => import("@/pages/admin/Tribes"));
const AdminFixtures = lazy(() => import("@/pages/admin/Fixtures"));
const AdminResults = lazy(() => import("@/pages/admin/Results"));
const AdminAmericano = lazy(() => import("@/pages/admin/Americano"));
const AdminAwards = lazy(() => import("@/pages/admin/Awards"));
const AdminUsers = lazy(() => import("@/pages/admin/Users"));
const AdminAudit = lazy(() => import("@/pages/admin/Audit"));
const AdminExports = lazy(() => import("@/pages/admin/Exports"));
const AdminAnnouncements = lazy(() => import("@/pages/admin/Announcements"));
const AdminSettings = lazy(() => import("@/pages/admin/Settings"));
const AdminCompetitions = lazy(() => import("@/pages/admin/Competitions"));
const RevealPage = lazy(() => import("@/pages/Reveal"));
const AmericanoPage = lazy(() => import("@/pages/Americano"));
const AwardsPage = lazy(() => import("@/pages/Awards"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Gate() {
  const { status, profile, profileLoading } = useAuth();
  const loc = useLocation();
  if (status === "loading" || (status === "in" && profileLoading)) return <div className="grid min-h-dvh place-items-center"><Loading /></div>;
  if (status === "out") return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!profile && loc.pathname !== "/complete-profile") return <Navigate to="/complete-profile" replace />;
  if (profile?.status === "suspended") return <div className="grid min-h-dvh place-items-center p-6 text-center"><div><h1 className="text-3xl font-black">Account suspended</h1><p className="mt-2 text-sand/80">Contact an administrator to restore access.</p></div></div>;
  return <CompProvider><Shell /></CompProvider>;
}

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center"><Loading /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
        <Route element={<Gate />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/table" element={<TablePage />} />
          <Route path="/fixtures" element={<FixturesPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/tribes" element={<TribesPage />} />
          <Route path="/reveal" element={<RevealPage />} />
          <Route path="/americano" element={<AmericanoPage />} />
          <Route path="/awards" element={<AwardsPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="registrations" element={<AdminRegistrations />} />
            <Route path="tribes" element={<AdminTribes />} />
            <Route path="fixtures" element={<AdminFixtures />} />
            <Route path="results" element={<AdminResults />} />
            <Route path="americano" element={<AdminAmericano />} />
            <Route path="awards" element={<AdminAwards />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="exports" element={<AdminExports />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="competitions" element={<AdminCompetitions />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
