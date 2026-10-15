const TZ = "Africa/Johannesburg"; // SAST, no daylight saving
export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso.length === 10 ? iso + "T12:00:00+02:00" : iso));
export const fmtShortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso.length === 10 ? iso + "T12:00:00+02:00" : iso));
export const fmtRand = (cents: number) => "R" + Math.round(cents / 100).toLocaleString("en-ZA").replace(/\u00a0/g, " ");
export const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 2 * 3600e3).toISOString().slice(0, 16) : "");
export const fromLocalInput = (v: string) => (v ? new Date(v + ":00+02:00").toISOString() : null);
export function countdown(to: Date, now: Date) {
  const ms = Math.max(0, to.getTime() - now.getTime());
  return { days: Math.floor(ms / 864e5), hours: Math.floor(ms / 36e5) % 24, minutes: Math.floor(ms / 6e4) % 60, seconds: Math.floor(ms / 1e3) % 60, done: ms === 0 };
}
export const PHASE_LABEL: Record<string, string> = {
  draft: "Not open yet", registration: "Registration open", opening: "Opening Americano", tribal: "Tribal matches", finale: "Finale", completed: "Completed",
};
