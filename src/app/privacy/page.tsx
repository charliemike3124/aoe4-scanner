import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How AOE4Scanner handles analytics and locally stored preferences.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[linear-gradient(180deg,#030712_0%,#07111f_60%,#030712_100%)]">
      <section className="mx-auto flex w-full max-w-[860px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <AppNav />
        <article className="space-y-6 text-sm leading-7 text-slate-300">
          <div>
            <h1 className="text-4xl font-black text-white">Privacy</h1>
            <p className="mt-3">Last updated June 22, 2026.</p>
          </div>
          <section>
            <h2 className="text-xl font-bold text-white">Analytics</h2>
            <p className="mt-2">
              AOE4Scanner uses Google Analytics to understand aggregate traffic, page usage, and outbound link activity. It does not
              intentionally send player-search text, bookmarks, or game preferences to analytics.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">Local preferences</h2>
            <p className="mt-2">
              Bookmarks, filters, spoiler settings, and short-lived data caches are stored in your browser. They are not tied to an
              AOE4Scanner account and can be removed by clearing this site&apos;s browser data.
            </p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-white">Third-party services</h2>
            <p className="mt-2">
              The site links to and retrieves public game information from AOE4World. External links such as AOE4World, YouTube, Twitch, and
              PayPal are governed by their own privacy policies.
            </p>
          </section>
        </article>
      </section>
    </main>
  );
}
