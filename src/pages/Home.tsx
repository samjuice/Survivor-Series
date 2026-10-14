import { isConfigured } from "@/lib/supabase";

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center px-6 text-center bg-gradient-to-b from-ink via-moss to-ink">
      <div>
        <p className="text-gold text-sm tracking-[0.3em] uppercase">The Padel Series</p>
        <h1 className="text-6xl sm:text-8xl font-bold text-parchment mt-3">Survivor</h1>
        <p className="mt-4 text-sand/70">Outwit. Outplay. Outrally.</p>
        {!isConfigured && <p className="mt-8 text-xs text-olive">Backend not connected yet.</p>}
        <p className="mt-10 text-[10px] text-sand/30">build {__BUILD__}</p>
      </div>
    </main>
  );
}
