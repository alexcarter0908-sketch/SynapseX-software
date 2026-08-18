export function DashboardLayoutSkeleton() {
  return (
    <main className="min-h-screen bg-[#081011] p-4 text-slate-100 md:p-6">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1440px] flex-col rounded-3xl border border-cyan-400/20 bg-[#0c1718] shadow-2xl shadow-black/30">
        <header className="border-b border-cyan-400/10 px-5 py-5 md:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">SynapseX command center</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-4xl">PowerShell Engineering Studio</h1>
          <p className="mt-2 text-sm text-slate-400">Assistant workspace load ho raha hai — screen khali nahi hui.</p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
          <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-2xl border border-cyan-400/10 bg-[#0a1314]">
            <div className="max-w-md px-6 text-center">
              <div className="mx-auto mb-5 size-10 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
              <p className="font-medium text-cyan-100">Assistant reconnecting…</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Saved chat aur project data preserve hain. Agar yeh message 30 seconds se zyada rahe to browser mein Reload Assistant karein.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
            <div className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-950/70" />
            <div className="size-10 rounded-lg bg-cyan-400/40" />
          </div>
        </div>
      </section>
    </main>
  );
}
