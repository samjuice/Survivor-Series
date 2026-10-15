import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Profile } from "@/types";

interface AuthValue {
  status: "loading" | "out" | "in"; session: Session | null; user: User | null;
  profile: Profile | null; profileLoading: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void>;
}
const Ctx = createContext<AuthValue | null>(null);
export const useAuth = () => { const v = useContext(Ctx); if (!v) throw new Error("AuthProvider missing"); return v; };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    // Never await supabase calls inside this callback (it can deadlock auth); just record the session.
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setReady(true); if (!s) qc.clear(); });
    return () => data.subscription.unsubscribe();
  }, [qc]);
  const uid = session?.user.id;
  const profileQ = useQuery({
    queryKey: ["profile", uid], enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid!).maybeSingle();
      if (error) throw error; return (data as Profile | null) ?? null;
    },
  });
  const value: AuthValue = {
    status: !ready ? "loading" : session ? "in" : "out", session, user: session?.user ?? null,
    profile: profileQ.data ?? null, profileLoading: !!uid && profileQ.isLoading,
    refreshProfile: async () => { await qc.invalidateQueries({ queryKey: ["profile", uid] }); },
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
