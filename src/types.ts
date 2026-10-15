export type Phase = "draft" | "registration" | "opening" | "tribal" | "finale" | "completed";
export interface Competition {
  id: string; name: string; slug: string; phase: Phase; capacity: number; team_size: number;
  entry_fee_cents: number; admin_fee_cents: number; prize_pool_override_cents: number | null; points_per_win: number;
  starts_on: string | null; completion_target: string | null; show_table: boolean; show_fixtures: boolean; created_at: string;
}
export interface Profile { id: string; full_name: string; display_name: string | null; status: "active" | "suspended" | "deleted"; }
export type RegStatus = "pending" | "approved" | "waitlisted" | "rejected" | "withdrawn";
export interface Registration {
  id: string; competition_id: string; user_id: string | null; placeholder_name: string | null;
  status: RegStatus; payment_status: "unpaid" | "paid"; paid_at: string | null; created_at: string;
}
export interface Team { id: string; competition_id: string; name: string; emblem_key: string | null; color: string | null; status: "active" | "withdrawn"; revealed: boolean; }
export interface TeamMember { id: string; team_id: string; registration_id: string; is_captain: boolean; joined_at: string; left_at: string | null; }
export interface Fixture { id: string; competition_id: string; round: number; team_a: string; team_b: string; scheduled_at: string | null; status: "scheduled" | "played" | "walkover" | "cancelled"; }
export interface ResultSet { set_no: number; a_games: number; b_games: number; }
export interface MatchResult {
  id: string; competition_id: string; fixture_id: string; submitted_by: string | null; status: "pending" | "approved" | "rejected";
  walkover: boolean; winner_team: string; reject_reason: string | null; reviewed_at: string | null; created_at: string; result_sets: ResultSet[];
}
export interface StandingRow {
  competition_id: string; team_id: string; name: string; status: "active" | "withdrawn"; played: number; won: number; lost: number; points: number;
  sets_for: number; sets_against: number; set_diff: number; games_for: number; games_against: number; game_diff: number; rank: number; is_tied: boolean;
}
export interface RosterRow { team_id: string; competition_id: string; registration_id: string; name: string; is_captain: boolean; }
export interface Announcement { id: string; competition_id: string; title: string; body: string; pinned: boolean; created_at: string; }
export interface FeedEvent { id: number; competition_id: string; kind: string; payload: Record<string, unknown>; created_at: string; }
export interface Roles { is_owner: boolean; admin_of: string[]; }
