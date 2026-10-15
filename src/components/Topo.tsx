// Contour-line texture, generated once. Used sparingly (home hero, sign-in).
function ring(cx: number, cy: number, r: number, seed: number): string {
  const pts: string[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wob = 1 + 0.16 * Math.sin(t * 3 + seed) + 0.09 * Math.sin(t * 5 - seed * 1.7) + 0.05 * Math.sin(t * 9 + seed * 0.6);
    pts.push(`${(cx + Math.cos(t) * r * wob).toFixed(1)} ${(cy + Math.sin(t) * r * wob * 0.8).toFixed(1)}`);
  }
  return "M" + pts.join("L") + "Z";
}
const PATHS = [
  ...Array.from({ length: 11 }, (_, i) => ring(260, 150, 26 + i * 24, 0.4 + i * 0.07)),
  ...Array.from({ length: 7 }, (_, i) => ring(560, 330, 20 + i * 26, 2.1 + i * 0.09)),
];
export default function Topo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 460" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.1">
      {PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
