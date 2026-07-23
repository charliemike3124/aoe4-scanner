import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { OutlierFeed } from "@/components/games/OutlierFeed";
import { buttonClassName } from "@/components/ui/button";

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "AOE4Scanner",
    url: "https://www.aoe4scanner.com/",
    description: "Discover unusual high-level Age of Empires IV ranked 1v1 games and civilization specialists.",
    publisher: {
      "@type": "Person",
      name: "SwaggyProfessor",
      url: "https://www.youtube.com/@SwaggyProfessor",
    },
  };

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_34%),linear-gradient(180deg,#030712_0%,#07111f_55%,#030712_100%)]"
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <AppNav />

        <OutlierFeed mode="latest" pageSize={3} showHighlights />

        <div className="flex justify-center">
          <Link href="/games" className={buttonClassName()}>
            Browse archive
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <section className="grid gap-4 border-t border-white/10 pt-8 text-sm leading-6 text-slate-400 md:grid-cols-3">
          <div>
            <h2 className="font-bold text-white">What gets scanned?</h2>
            <p className="mt-1">Recent high-level ranked 1v1 matches from AOE4World, refreshed on a regular schedule.</p>
          </div>
          <div>
            <h2 className="font-bold text-white">Why is a game featured?</h2>
            <p className="mt-1">
              The scanner looks for rating upsets, uncommon civilization wins, difficult matchups, and unusual game patterns.
            </p>
          </div>
          <div>
            <h2 className="font-bold text-white">Who is it for?</h2>
            <p className="mt-1">Players, coaches, casters, and creators looking for memorable matches worth studying or sharing.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
