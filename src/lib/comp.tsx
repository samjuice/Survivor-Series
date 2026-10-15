import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type { Competition, Roles } from "@/types";

interface CompValue { loading: boolean; competitions: Competition[]; comp: Competition | null; setCompId: (id: string) => void; isOwner: boolean; isAdmin: boolean; }
const Ctx = createContext<CompValue | null>(null);
export const useComp = () => { const v = useContext(Ctx); if (!v) throw new Error("CompProvider missing"); return v; };
const KEY = "padel.competition";

export function CompProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pick, setPick] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const comps = useQuery({
    queryKey: ["competitions", user?.id], enabled: !!user,
    queryFn: async () => { const { data, error } = await supabase.from("competitions").select("*").order("created_at", { ascending: false }); if (error) throw error; return data as Competition[]; },
  });
  const roles = useQuery({
    queryKey: ["roles", user?.id], enabled: !!user,
    queryFn: async () => { const { data, error } = await supabase.rpc("my_roles"); if (error) throw error; return data as Roles; },
  });
  const list = useMemo(() => comps.data ?? [], [comps.data]);
  const comp = list.find((c) => c.id === pick) ?? list.find((c) => c.phase !== "draft" && c.phase !== "completed") ?? list[0] ?? null;
  useEffect(() => { if (comp) try { localStorage.setItem(KEY, comp.id); } catch { /* storage may be unavailable */ } }, [comp]);
  const isOwner = !!roles.data?.is_owner;
  const isAdmin = !!comp && (isOwner || !!roles.data?.admin_of.includes(comp.id));
  return <Ctx.Provider value={{ loading: comps.isLoading || roles.isLoading, competitions: list, comp, setCompId: setPick, isOwner, isAdmin }}>{children}</Ctx.Provider>;
}
