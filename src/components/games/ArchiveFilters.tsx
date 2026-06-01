"use client";

import { CURRENT_RM_SOLO_MAPS } from "@/lib/aoe4/civilizations";
import { CivilizationSelect } from "@/components/games/CivilizationSelect";
import { PlayerAutocompleteInput } from "@/components/games/PlayerAutocompleteInput";
import { buttonClassName } from "@/components/ui/button";

export function ArchiveFilters({
  filters,
  onApply,
  onReset,
}: {
  filters: Record<string, string | undefined>;
  onApply: (formData: FormData) => void;
  onReset?: () => void;
}) {
  return (
    <form
      key={JSON.stringify(filters)}
      className="rounded-lg border border-white/10 bg-slate-950/70 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(new FormData(event.currentTarget));
      }}
    >
      <div className="grid gap-3 md:grid-cols-5">
        <label className="space-y-1 text-sm text-slate-300">
          <span>Player search</span>
          <PlayerAutocompleteInput defaultValue={filters.q} />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Civilization</span>
          <CivilizationSelect defaultValue={filters.civilization} />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Map</span>
          <select name="map" defaultValue={filters.map ?? ""} className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none">
            <option value="">Any map</option>
            {CURRENT_RM_SOLO_MAPS.map((map) => (
              <option key={map} value={map}>
                {map}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Min Elo</span>
          <input
            name="minElo"
            type="number"
            min={1600}
            max={2500}
            step={50}
            defaultValue={filters.minElo ?? ""}
            placeholder="1600"
            className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Max Elo</span>
          <input
            name="maxElo"
            type="number"
            min={1600}
            max={2500}
            step={50}
            defaultValue={filters.maxElo ?? ""}
            placeholder="2500"
            className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
          <input name="latest48h" value="true" type="checkbox" defaultChecked={filters.latest48h === "true"} className="h-4 w-4 accent-sky-400" />
          Latest 48 hours only
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
          <input name="bookmarkedOnly" value="true" type="checkbox" defaultChecked={filters.bookmarkedOnly === "true"} className="h-4 w-4 accent-gold" />
          Bookmarked only
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button className={buttonClassName()} type="submit">
          Apply filters
        </button>
        <button className={buttonClassName("ghost")} type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </form>
  );
}
