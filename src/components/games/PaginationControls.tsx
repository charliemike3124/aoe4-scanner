import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PaginationControls({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: URLSearchParams;
}) {
  const previousParams = new URLSearchParams(params);
  previousParams.set("page", String(Math.max(1, page - 1)));
  const nextParams = new URLSearchParams(params);
  nextParams.set("page", String(Math.min(pageCount, page + 1)));

  return (
    <nav className="flex items-center justify-between gap-3 text-sm text-slate-300">
      <span>
        Page {page} of {Math.max(pageCount, 1)}
      </span>
      <div className="flex gap-2">
        <Link
          aria-disabled={page <= 1}
          className={cn(buttonClassName("ghost"), page <= 1 && "pointer-events-none opacity-40")}
          href={`/games?${previousParams.toString()}`}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Link>
        <Link
          aria-disabled={page >= pageCount}
          className={cn(buttonClassName("ghost"), page >= pageCount && "pointer-events-none opacity-40")}
          href={`/games?${nextParams.toString()}`}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </nav>
  );
}

