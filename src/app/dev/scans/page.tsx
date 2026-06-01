import { ScanRunsView } from "@/components/dev/ScanRunsView";

export default function DevScansPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#030712_0%,#07111f_60%,#030712_100%)]">
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-200">Developer view</p>
          <h1 className="text-3xl font-black text-white">Scanner logs</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            Latest Firestore scan run records, formatted for quick checks after scheduled or manual scanner runs.
          </p>
        </header>

        <ScanRunsView />
      </section>
    </main>
  );
}
