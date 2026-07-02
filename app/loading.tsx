export default function AppLoading() {
  return (
    <main className="relative min-h-[100svh] bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-400" />
        <p className="mt-6 font-mono text-[10px] tracking-[0.3em] uppercase text-slate-500">
          Summoning your quests…
        </p>
      </div>
    </main>
  );
}
