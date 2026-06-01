"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { ArchiveFilters } from "@/components/games/ArchiveFilters";
import { OutlierFeed } from "@/components/games/OutlierFeed";

export function ArchiveView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = {
    q: searchParams.get("q") ?? undefined,
    civilization: searchParams.get("civilization") ?? undefined,
    map: searchParams.get("map") ?? undefined,
    minElo: searchParams.get("minElo") ?? undefined,
    maxElo: searchParams.get("maxElo") ?? undefined,
    latest48h: searchParams.get("latest48h") ?? undefined,
    bookmarkedOnly: searchParams.get("bookmarkedOnly") ?? undefined,
  };

  function applyFilters(formData: FormData) {
    const next = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      const text = typeof value === "string" ? value.trim() : "";
      if (text) next.set(key, text);
    }

    router.replace(next.toString() ? `/games?${next.toString()}` : "/games");
  }

  return (
    <>
      <ArchiveFilters filters={filters} onApply={applyFilters} onReset={() => router.replace("/games")} />
      <OutlierFeed
        mode="archive"
        filters={{
          q: filters.q,
          civilization: filters.civilization,
          map: filters.map,
          minElo: filters.minElo ? Number(filters.minElo) : undefined,
          maxElo: filters.maxElo ? Number(filters.maxElo) : undefined,
          latest48h: filters.latest48h === "true",
          bookmarkedOnly: filters.bookmarkedOnly === "true",
        }}
      />
    </>
  );
}
