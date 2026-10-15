import { useAuth } from "./auth";
import { useComp } from "./comp";
import { useMyMembership, useMyRegistration, useTeams } from "./data";

/** The signed-in player's place in the selected competition. */
export function useMe() {
  const { user } = useAuth(); const { comp } = useComp();
  const reg = useMyRegistration(comp?.id, user?.id);
  const mem = useMyMembership(reg.data?.id);
  const teams = useTeams(comp?.id);
  const myTeam = mem.data ? teams.data?.find((t) => t.id === mem.data!.team_id) : undefined;
  return { reg: reg.data ?? null, mem: mem.data ?? null, myTeam, isCaptain: !!mem.data?.is_captain, loading: reg.isLoading || mem.isLoading || teams.isLoading };
}
