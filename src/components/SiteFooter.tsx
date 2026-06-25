import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950 px-4 py-6 text-sm text-slate-400">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>AOE4Scanner is an independent community project and is not affiliated with Microsoft.</p>
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
