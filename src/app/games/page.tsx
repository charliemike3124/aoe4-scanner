import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { ArchiveView } from "@/components/games/ArchiveView";

export default function GamesPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#030712_0%,#07111f_60%,#030712_100%)]">
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <AppNav />

        <header className="space-y-3">
          <h1 className="text-4xl font-black text-white">Outlier game archive</h1>
          <p className="max-w-2xl text-slate-300">
            Browse recent standout matches the scanner has found, then filter by player, civilization, map, or recency to find games worth studying.
          </p>
        </header>

        <Suspense fallback={null}>
          <ArchiveView />
        </Suspense>
      </section>
    </main>
  );
}
