// Original tribe emblems (no third-party branding). Admins pick one per tribe via emblem_key.
const PATHS: Record<string, string> = {
  fang: "M8 6c1 17 7 29 16 37 9-8 15-20 16-37-5 5-10 7-16 7S13 11 8 6zM19 16l5 12 5-12z",
  leaf: "M24 5C11 11 7 26 11 39c15 3 28-6 30-25-7-1-13-5-17-9zM23 15c-2 8-2 16 1 24",
  wave: "M3 18c5-7 9-7 14 0s9 7 14 0 8-5 14-2v8c-6-3-9-2-14 2s-9 4-14-2-9-5-14 2zM3 32c5-6 9-6 14 0s9 6 14 0 8-5 14-2v6c-6-3-9-2-14 2s-9 4-14-2-9-4-14 2z",
  flame: "M25 3c1 9 11 14 11 27a12 12 0 0 1-24 0c0-6 3-9 6-14 1 4 3 6 5 6 2-5 2-10 2-19zM24 26c-3 3-4 5-4 8a4 4 0 0 0 8 0c0-3-2-5-4-8z",
  mask: "M24 5C13 5 7 13 7 23c0 11 7 20 17 20s17-9 17-20C41 13 35 5 24 5zM13 20l9 4-9 4zM35 20l-9 4 9 4zM19 35h10v3H19z",
  talon: "M10 5c11 1 22 9 24 25l-7-4c-1 6-5 11-12 14 4-9 3-20-5-35zM36 12c3 5 4 10 3 16l-4-4c1-4 1-8 1-12z",
  shell: "M24 42L5 22C9 9 39 9 43 22zM24 42V13M24 42L13 14M24 42L35 14M24 42L7 22M24 42l17-20",
  peak: "M1 41L17 11l8 14 6-8 16 24zM17 20l-5 9h10z",
};
export const EMBLEM_KEYS = Object.keys(PATHS);
export function Emblem({ k, className = "h-6 w-6" }: { k: string | null | undefined; className?: string }) {
  const d = PATHS[k ?? ""] ?? PATHS.peak;
  return <svg viewBox="0 0 48 48" className={className} fill="currentColor" fillRule="evenodd" aria-hidden="true"><path d={d} /></svg>;
}
export const TRIBE_COLORS = ["#3d6b45", "#7d8a45", "#b5703a", "#4a7f8c", "#8c4a5a", "#6b5a8c", "#a89a5c", "#5c7a6b"];
export const tribeColor = (c: string | null | undefined) => c ?? "#3d6b45";
