import { Tooltip } from "@/components/ui/tooltip";

export function OldGameBadge() {
  return (
    <Tooltip label="This game might no longer be watchable in-game because both players have played 10+ matches since then.">
      <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
        Old game
      </span>
    </Tooltip>
  );
}

