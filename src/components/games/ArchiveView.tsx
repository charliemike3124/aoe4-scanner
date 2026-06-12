"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { ArchiveFilters } from "@/components/games/ArchiveFilters";
import { OutlierFeed } from "@/components/games/OutlierFeed";

const ARCHIVE_FILTERS_KEY = "aoe4scanner:archive-filters";
const FILTER_KEYS = ["q", "civilization", "map", "minElo", "maxElo", "minScore", "maxScore", "sort", "latest48h", "bookmarkedOnly", "upsetsOnly"];

function readSavedFilters() {
  try {
    const saved = localStorage.getItem(ARCHIVE_FILTERS_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved) as Record<string, string>;
    return Object.fromEntries(FILTER_KEYS.map((key) => [key, parsed[key]]).filter(([, value]) => typeof value === "string" && value.length > 0));
  } catch {
    return {};
  }
}

export function ArchiveView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savedFilters, setSavedFilters] = useState<Record<string, string>>({});
  const hasSearchParams = searchParams.toString().length > 0;

  useEffect(() => {
    setSavedFilters(readSavedFilters());
  }, []);

  const filters = useMemo(() => ({
    q: searchParams.get("q") ?? undefined,
    civilization: searchParams.get("civilization") ?? undefined,
    map: searchParams.get("map") ?? undefined,
    minElo: searchParams.get("minElo") ?? undefined,
    maxElo: searchParams.get("maxElo") ?? undefined,
    minScore: searchParams.get("minScore") ?? undefined,
    maxScore: searchParams.get("maxScore") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    latest48h: searchParams.get("latest48h") ?? undefined,
    bookmarkedOnly: searchParams.get("bookmarkedOnly") ?? undefined,
    upsetsOnly: searchParams.get("upsetsOnly") ?? undefined,
  }), [searchParams]);

  const activeFilters = hasSearchParams ? filters : { ...filters, ...savedFilters };
  const minElo = activeFilters.minElo ? Number(activeFilters.minElo) : undefined;
  const maxElo =
    activeFilters.maxElo && (minElo == null || Number(activeFilters.maxElo) > minElo)
      ? Number(activeFilters.maxElo)
      : undefined;

  function applyFilters(formData: FormData) {
    const next = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      const text = typeof value === "string" ? value.trim() : "";
      if (text) next.set(key, text);
    }

    localStorage.setItem(ARCHIVE_FILTERS_KEY, JSON.stringify(Object.fromEntries(next.entries())));
    router.replace(next.toString() ? `/games?${next.toString()}` : "/games");
  }

  function resetFilters() {
    localStorage.removeItem(ARCHIVE_FILTERS_KEY);
    setSavedFilters({});
    router.replace("/games");
  }

  return (
    <>
      <ArchiveFilters filters={activeFilters} onApply={applyFilters} onReset={resetFilters} />
      <OutlierFeed
        mode="archive"
        filters={{
          q: activeFilters.q,
          civilization: activeFilters.civilization,
          map: activeFilters.map,
          minElo,
          maxElo,
          minScore: activeFilters.minScore ? Number(activeFilters.minScore) : undefined,
          maxScore: activeFilters.maxScore ? Number(activeFilters.maxScore) : undefined,
          sort: activeFilters.sort === "score" ? "score" : "newest",
          latest48h: activeFilters.latest48h === "true",
          bookmarkedOnly: activeFilters.bookmarkedOnly === "true",
          upsetsOnly: activeFilters.upsetsOnly === "true",
        }}
      />
    </>
  );
}
