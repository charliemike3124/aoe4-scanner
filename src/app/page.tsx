import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { OutlierFeed } from "@/components/games/OutlierFeed";
import { buttonClassName } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),linear-gradient(180deg,#030712_0%,#07111f_55%,#030712_100%)]">
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <AppNav />

        <header className="space-y-4">
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-black leading-tight text-white sm:text-5xl">
              Standout ranked AoE4 games worth studying
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              Outlier games are matches where the result breaks expectation: an underdog beats a much higher-rated opponent, a rarely picked civilization wins, a difficult matchup flips, or a high-level game runs unusually long.
            </p>
          </div>
        </header>

        <OutlierFeed mode="latest" pageSize={10} />

        <div className="flex justify-center">
          <Link href="/games" className={buttonClassName()}>
            Browse archive
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
