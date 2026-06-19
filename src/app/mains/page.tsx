import type { Metadata } from "next";
import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { CivilizationMainsDirectory } from "@/components/mains/CivilizationMainsDirectory";

export const metadata: Metadata = {
  title: "Find Civilization Mains | AOE4Scanner",
  description: "Find high-level Age of Empires IV players who specialize in each civilization.",
};

export default function CivilizationMainsPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(245,183,59,0.1),transparent_30%),linear-gradient(180deg,#030712_0%,#07111f_60%,#030712_100%)]">
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <AppNav />

        <header className="space-y-3">
          <h1 className="text-4xl font-black text-white">Find civilization mains</h1>
          <p className="max-w-2xl text-slate-300">
            Pick a civilization to find experienced specialists, inspect their statistics, and jump directly to their profiles and games.
          </p>
        </header>

        <Suspense fallback={null}>
          <CivilizationMainsDirectory />
        </Suspense>
      </section>
    </main>
  );
}
