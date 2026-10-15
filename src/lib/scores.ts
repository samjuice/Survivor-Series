// Mirrors the database rules so the form can explain problems before saving.
export const isValidSet = (a: number, b: number): boolean =>
  (a === 6 && b >= 0 && b <= 4) || (b === 6 && a >= 0 && a <= 4) || (a === 7 && (b === 5 || b === 6)) || (b === 7 && (a === 5 || a === 6));

export interface SetInput { a: string; b: string; }
export interface Validation { setErrors: (string | null)[]; matchError: string | null; ok: boolean; parsed: [number, number][] | null; }

export function validateSets(sets: SetInput[]): Validation {
  const setErrors: (string | null)[] = [];
  const parsed: [number, number][] = [];
  let incomplete = 0;
  for (const s of sets) {
    const aT = s.a.trim(), bT = s.b.trim();
    if (aT === "" && bT === "") { setErrors.push("Enter both scores."); incomplete++; continue; }
    if (aT === "" || bT === "") { setErrors.push("Enter both scores."); incomplete++; continue; }
    if (!/^\d+$/.test(aT) || !/^\d+$/.test(bT)) { setErrors.push("Use whole numbers only."); incomplete++; continue; }
    const a = Number(aT), b = Number(bT);
    if (a > 7 || b > 7) { setErrors.push("No set score goes above 7."); incomplete++; continue; }
    if (a === b) { setErrors.push("A set can't end level."); incomplete++; continue; }
    if (!isValidSet(a, b)) { setErrors.push(`${a}-${b} isn't a finished set. Sets end 6-0 to 6-4, 7-5 or 7-6.`); incomplete++; continue; }
    setErrors.push(null); parsed.push([a, b]);
  }
  const ok = incomplete === 0 && parsed.length === 3;
  return {
    setErrors, parsed: ok ? parsed : null, ok,
    matchError: ok ? null : "Every match is exactly 3 sets. Fix the sets marked below.",
  };
}

export function setsWon(parsed: [number, number][]): [number, number] {
  return [parsed.filter(([a, b]) => a > b).length, parsed.filter(([a, b]) => b > a).length];
}
