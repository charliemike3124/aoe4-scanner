import type { Metadata } from "next";
import { Suspense } from "react";
import { AppNav } from "@/components/AppNav";
import { ArchiveView } from "@/components/games/ArchiveView";

export const metadata: Metadata = {
  title: "Outlier Game Archive",
  description: "Browse and filter unusual high-level Age of Empires IV ranked games, including major upsets and rare civilization wins.",
  alternates: { canonical: "/games" },
  openGraph: {
    url: "/games",
    title: "AOE4 Outlier Game Archive",
    description: "Browse standout high-level Age of Empires IV ranked matches.",
  },
};

export default function GamesPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#0b0e0d]">
      <AppNav />
      <section className="app-shell py-12 sm:py-16">
        <header className="mb-9">
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-[#e8e3d4] sm:text-5xl">Game archive</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9ea097] sm:text-base">
            Search every standout match and open the complete analysis when you need it.
          </p>
        </header>
        <Suspense fallback={null}>
          <ArchiveView />
        </Suspense>
      </section>
    </main>
  );
}
