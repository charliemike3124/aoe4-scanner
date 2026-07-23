import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-4 py-6 text-sm text-slate-400">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          AOE4Scanner is an independent community project using data provided by{" "}
          <a href="https://aoe4world.com/" target="_blank" rel="noreferrer" className="font-medium text-sky-200 transition hover:text-white">
            AOE4World
          </a>
          . Not affiliated with Microsoft.
        </p>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link href="/privacy" className="transition hover:text-white">
            Privacy
          </Link>
          <a href="https://www.youtube.com/@SwaggyProfessor" target="_blank" rel="noreferrer" className="transition hover:text-white">
            Creator
          </a>
        </nav>
      </div>
    </footer>
  );
}
