import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";

export function ScorePill({ score }: { score: number }) {
  return (
    <div className="relative flex h-[5.5rem] w-[5.5rem] shrink-0 flex-col items-center justify-center rounded-sm border border-[#3b443f] bg-[#0b0e0d] px-2 text-[#e8e3d4]">
      <div className="absolute right-1.5 top-1.5">
        <Tooltip
          side="bottom"
          align="start"
          label="The score adds weight for signals like MMR upsets, rare or low-win-rate civilization wins, elite opponents, long games, and high-level games. Higher means more unusual."
        >
          <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-[#9ea097]">
            <Info className="h-3 w-3" />
          </span>
        </Tooltip>
      </div>
      <span className="mt-1 text-2xl font-semibold tabular-nums leading-none">{Math.round(score)}</span>
      <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9ea097]">score</span>
    </div>
  );
}
