"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppNav() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Highlights" },
    { href: "/mains", label: "Civ mains" },
    { href: "/games", label: "Archive" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-[#2b332f] bg-[#0b0e0d]/95 backdrop-blur">
      <div className="app-shell flex flex-col items-start gap-3 py-4 sm:h-[104px] sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:py-0">
        <Link href="/" className="block text-base font-extrabold uppercase tracking-[0.22em] text-gold">
          AOE4Scanner
        </Link>

        <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start sm:gap-3">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative px-2 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8f928a] transition hover:text-[#e8e3d4] sm:px-3 sm:text-xs",
                  active && "text-[#e8e3d4] after:absolute after:inset-x-2 after:bottom-1 after:h-px after:bg-gold",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        <Tooltip
          side="bottom"
          align="end"
          label="Your support helps keep the scanner running, maintained, and useful for the AoE4 community."
        >
          <a
            href="https://www.paypal.com/donate/?hosted_button_id=H3SK4FD7963UE"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonClassName("secondary"), "ml-1 hidden sm:inline-flex")}
          >
            Support
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Tooltip>
        </div>
      </div>
    </nav>
  );
}
