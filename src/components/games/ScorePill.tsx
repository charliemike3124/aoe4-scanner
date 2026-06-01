import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

export function ScorePill({ score }: { score: number }) {
  return (
    <div className="relative flex h-16 w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-md border border-sky-300/30 bg-sky-400/12 px-2 text-sky-100">
      <div className="absolute right-1 top-1">
        <Tooltip
          side="bottom"
          align="start"
          label="The score adds weight for signals like MMR upsets, rare or low-win-rate civilization wins, elite opponents, long games, and high-level games. Higher means more unusual."
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-sky-200/70">
            <Info className="h-3 w-3" />
          </span>
        </Tooltip>
      </div>
      <span className="mt-1 text-xl font-bold tabular-nums leading-none">{Math.round(score)}</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-sky-200/70">score</span>
    </div>
  );
}
