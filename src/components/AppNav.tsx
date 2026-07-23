import Link from "next/link";
import { Archive, Flag, HeartHandshake } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppNav() {
  return (
    <nav className="sticky top-0 z-50 -mx-4 flex items-center justify-between gap-4 rounded-b-2xl border-b border-white/10 bg-slate-950/88 px-4 py-3 shadow-[0_16px_40px_rgba(2,6,23,0.34)] backdrop-blur supports-[backdrop-filter]:bg-slate-950/72 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-1">
        <Link href="/" className="block text-sm font-bold uppercase tracking-[0.28em] text-gold">
          AOE4Scanner
        </Link>
        <a
          href="https://www.youtube.com/@SwaggyProfessor"
          target="_blank"
          rel="noreferrer"
          className="block text-xs font-medium text-slate-400 transition hover:text-sky-200"
        >
          By SwaggyProfessor
        </a>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/mains" className={cn(buttonClassName("ghost"), "px-3 sm:px-4")}>
          <Flag className="h-4 w-4" />
          <span className="hidden sm:inline">Civ Mains</span>
        </Link>
        <Link href="/games" className={cn(buttonClassName("ghost"), "px-3 sm:px-4")}>
          <Archive className="h-4 w-4" />
          <span className="hidden sm:inline">Browse Games</span>
        </Link>
        <Tooltip
          side="bottom"
          align="end"
          label="Your support helps keep the scanner running, maintained, and useful for the AoE4 community."
        >
          <a
            href="https://www.paypal.com/donate/?hosted_button_id=H3SK4FD7963UE"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonClassName("secondary"), "px-3 sm:px-4")}
          >
            <HeartHandshake className="h-4 w-4" />
            <span className="hidden sm:inline">Donate</span>
          </a>
        </Tooltip>
      </div>
    </nav>
  );
}
