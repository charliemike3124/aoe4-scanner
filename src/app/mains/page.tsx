import type { Metadata } from "next";
import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { CivilizationMainsDirectory } from "@/components/mains/CivilizationMainsDirectory";

export const metadata: Metadata = {
  title: "Find Civilization Mains",
  description: "Find high-level Age of Empires IV players who specialize in each civilization.",
  alternates: { canonical: "/mains" },
  openGraph: {
    url: "/mains",
    title: "Find AOE4 Civilization Mains",
    description: "Find experienced high-level players who specialize in each Age of Empires IV civilization.",
  },
};

export default function CivilizationMainsPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#0b0e0d]">
      <AppNav />
      <section className="app-shell py-12 sm:py-16">
        <header className="mb-9">
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-[#e8e3d4] sm:text-5xl">Civilization mains</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9ea097] sm:text-base">
            Find experienced specialists and compare their recent performance.
          </p>
        </header>

        <Suspense fallback={null}>
          <CivilizationMainsDirectory />
        </Suspense>
      </section>
    </main>
  );
}
