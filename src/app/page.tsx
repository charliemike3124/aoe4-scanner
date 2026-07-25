import { AppNav } from "@/components/AppNav";
import { OutlierFeed } from "@/components/games/OutlierFeed";

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
    <main id="main-content" className="min-h-screen bg-[#0b0e0d]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <AppNav />
      <section className="app-shell py-12 sm:py-16">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Top 5 picks</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-[#e8e3d4] sm:text-5xl">Today&apos;s highlights</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9ea097] sm:text-base">
              Five standout games selected for upset value, unusual strategies, and study potential.
            </p>
          </div>
        </header>
        <OutlierFeed mode="latest" pageSize={5} showHighlights />
      </section>
    </main>
  );
}
