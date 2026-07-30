"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { CURRENT_RM_SOLO_MAPS } from "@/lib/aoe4/civilizations";
import { CivilizationSelect } from "@/components/games/CivilizationSelect";
import { PlayerAutocompleteInput } from "@/components/games/PlayerAutocompleteInput";
import { buttonClassName } from "@/components/ui/button";
import { db } from "@/lib/firebase";

const MAP_POOL_CACHE_KEY = "aoe4scanner:map-pool:16.1.10056";
const MAP_POOL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STATIC_MAP_POOL = [...CURRENT_RM_SOLO_MAPS];
const STRATEGY_OPTIONS = [
  { label: "Fast Castle", value: "summary_fast_castle" },
  { label: "Fast Imperial", value: "summary_fast_imperial" },
  { label: "Feudal aggression", value: "strategy_feudal_aggression" },
  { label: "Feudal rams", value: "strategy_feudal_rams" },
  { label: "Multi-TC", value: "summary_multi_tc" },
  { label: "Dark age pressure", value: "summary_dark_age_aggression" },
  { label: "Dark age tower rush", value: "strategy_dark_age_tower_rush" },
  { label: "Rare landmarks", value: "summary_rare_landmark_path" },
  { label: "Late military", value: "summary_delayed_military" },
];
const CONTROL_CLASS =
  "h-10 w-full rounded-sm border border-[#2b332f] bg-[#0b0e0d] px-3 py-2 text-sm text-[#e8e3d4] outline-none transition placeholder:text-[#686d66] focus:border-gold";

function readCachedMapPool() {
  try {
    const cached = localStorage.getItem(MAP_POOL_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { storedAt: number; maps: string[] };
    if (Date.now() - parsed.storedAt > MAP_POOL_CACHE_TTL_MS) return null;
    return parsed.maps;
  } catch {
    return null;
  }
}

export function ArchiveFilters({
  filters,
  onApply,
  onReset,
}: {
  filters: Record<string, string | undefined>;
  onApply: (formData: FormData) => void;
  onReset?: () => void;
}) {
  const [maps, setMaps] = useState<string[]>(STATIC_MAP_POOL);
  const [minEloValue, setMinEloValue] = useState(filters.minElo ?? "");
  const parsedMinElo = Number(minEloValue);
  const maxEloMin = Number.isFinite(parsedMinElo) && minEloValue !== "" ? parsedMinElo + 1 : 0;

  useEffect(() => {
    setMinEloValue(filters.minElo ?? "");
  }, [filters.minElo]);

  useEffect(() => {
    const cached = readCachedMapPool();
    if (cached?.length) {
      setMaps(cached);
      return;
    }

    let cancelled = false;
    async function loadMapPool() {
      try {
        const snapshot = await getDoc(doc(db, "meta", "mapPool"));
        const remoteMaps = snapshot.exists()
          ? ((snapshot.data().maps ?? []) as unknown[])
              .map((entry) => (entry && typeof entry === "object" && "map" in entry ? (entry as { map?: unknown }).map : entry))
              .filter((map): map is string => typeof map === "string" && map.length > 0)
          : [];
        const nextMaps = remoteMaps.length >= STATIC_MAP_POOL.length ? remoteMaps : STATIC_MAP_POOL;
        if (!cancelled && nextMaps.length) {
          setMaps(nextMaps);
          localStorage.setItem(MAP_POOL_CACHE_KEY, JSON.stringify({ storedAt: Date.now(), maps: nextMaps }));
        }
      } catch {
        // Static maps remain available as fallback.
      }
    }

    loadMapPool();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <form
      key={JSON.stringify(filters)}
      className="border border-[#2b332f] bg-[#121715] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(new FormData(event.currentTarget));
      }}
    >
      <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-gold">Filter games</p>
      <div className="grid gap-4">
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Search players</span>
          <PlayerAutocompleteInput defaultValue={filters.q} />
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Civilization 1</span>
          <CivilizationSelect defaultValue={filters.civilization} placeholder="Any civilization" />
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Civilization 2</span>
          <CivilizationSelect
            name="opponentCivilization"
            defaultValue={filters.opponentCivilization}
            placeholder="Any opponent"
          />
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Map</span>
          <select name="map" defaultValue={filters.map ?? ""} className={CONTROL_CLASS}>
            <option value="">Any map</option>
            {maps.map((map) => (
              <option key={map} value={map}>
                {map}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Min Elo</span>
          <input
            name="minElo"
            type="number"
            min={0}
            step={1}
            defaultValue={filters.minElo ?? ""}
            onChange={(event) => setMinEloValue(event.currentTarget.value)}
            placeholder="Any"
            className={CONTROL_CLASS}
          />
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Max Elo</span>
          <input
            name="maxElo"
            type="number"
            min={maxEloMin}
            step={1}
            defaultValue={filters.maxElo ?? ""}
            placeholder="Any"
            className={CONTROL_CLASS}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-4">
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Order by</span>
          <select name="sort" defaultValue={filters.sort ?? "newest"} className={CONTROL_CLASS}>
            <option value="newest">Newest first</option>
            <option value="score">Highest score first</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Min Score</span>
          <input
            name="minScore"
            type="number"
            min={0}
            max={250}
            step={5}
            defaultValue={filters.minScore ?? ""}
            placeholder="Any"
            className={CONTROL_CLASS}
          />
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Max Score</span>
          <input
            name="maxScore"
            type="number"
            min={0}
            max={250}
            step={5}
            defaultValue={filters.maxScore ?? ""}
            placeholder="Any"
            className={CONTROL_CLASS}
          />
        </label>
        <label className="space-y-1.5 text-xs text-[#9ea097]">
          <span>Strategy</span>
          <select name="strategy" defaultValue={filters.strategy ?? ""} className={CONTROL_CLASS}>
            <option value="">Any strategy</option>
            {STRATEGY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 space-y-3 border-t border-[#2b332f] pt-5">
        <label className="flex items-center gap-2 text-xs text-[#d0cec4]">
          <input name="latest48h" value="true" type="checkbox" defaultChecked={filters.latest48h === "true"} className="h-4 w-4 accent-gold" />
          Latest 48 hours only
        </label>
        <label className="flex items-center gap-2 text-xs text-[#d0cec4]">
          <input name="bookmarkedOnly" value="true" type="checkbox" defaultChecked={filters.bookmarkedOnly === "true"} className="h-4 w-4 accent-gold" />
          Bookmarked only
        </label>
        <label className="flex items-center gap-2 text-xs text-[#d0cec4]">
          <input name="upsetsOnly" value="true" type="checkbox" defaultChecked={filters.upsetsOnly === "true"} className="h-4 w-4 accent-gold" />
          Upsets only
        </label>
        <label className="flex items-center gap-2 text-xs text-[#d0cec4]">
          <input name="civMainsOnly" value="true" type="checkbox" defaultChecked={filters.civMainsOnly === "true"} className="h-4 w-4 accent-gold" />
          Civ mains only
        </label>
      </div>
      <div className="mt-5 grid gap-2">
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
