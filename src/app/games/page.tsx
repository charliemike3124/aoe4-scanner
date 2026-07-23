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
    <main id="main-content" className="min-h-screen bg-[linear-gradient(180deg,#030712_0%,#07111f_60%,#030712_100%)]">
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <AppNav />

        <Suspense fallback={null}>
          <ArchiveView />
        </Suspense>
      </section>
    </main>
  );
}
