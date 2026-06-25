import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { buttonClassName } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="min-h-screen bg-[linear-gradient(180deg,#030712_0%,#07111f_60%,#030712_100%)]">
      <section className="mx-auto flex w-full max-w-[1080px] flex-col gap-12 px-4 py-8 sm:px-6 lg:px-8">
        <AppNav />
        <div className="mx-auto max-w-lg space-y-4 py-20 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-gold">404</p>
          <h1 className="text-4xl font-black text-white">That page wandered off-map</h1>
          <p className="text-slate-400">The link may be outdated, or the page may never have existed.</p>
          <Link href="/" className={buttonClassName()}>
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
