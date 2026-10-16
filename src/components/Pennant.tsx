import { Emblem, tribeColor } from "./Emblems";
// The hanging tribe pennant: the one memorable element on the home screen.
export default function Pennant({ name, color, emblem, animate = true, delay = 0 }: { name: string; color: string | null; emblem: string | null; animate?: boolean; delay?: number }) {
  const c = tribeColor(color);
  return (
    <div className={`relative mx-auto w-44 ${animate ? "pennant-drop" : ""}`} style={animate && delay ? { animationDelay: `${delay}s` } : undefined} role="img" aria-label={`${name} tribe pennant`}>
      <svg viewBox="0 0 160 250" className="w-full drop-shadow-[0_10px_18px_rgba(0,0,0,.45)]">
        <defs><linearGradient id="pshade" x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity=".3" /><stop offset=".5" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".22" /></linearGradient></defs>
        <rect x="6" y="6" width="148" height="7" rx="3.5" fill="#cdbf9a" />
        <path d="M18 13h124v186l-62 41-62-41z" fill={c} />
        <path d="M18 13h124v186l-62 41-62-41z" fill="url(#pshade)" />
        <path d="M29 24h102v170l-51 34-51-34z" fill="none" stroke="#efe4c8" strokeOpacity=".35" strokeWidth="1.5" />
      </svg>
      <div className="absolute inset-x-5 top-9 flex flex-col items-center gap-2 text-parchment">
        <Emblem k={emblem} className="h-14 w-14" />
        <p className="text-center font-display text-lg font-black leading-tight">{name}</p>
      </div>
    </div>
  );
}
