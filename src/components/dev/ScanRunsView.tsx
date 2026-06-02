"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, type DocumentData, type Timestamp } from "firebase/firestore";
import { ExternalLink, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/games/EmptyState";
import { buttonClassName } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type ScanRun = {
  id: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  type: string | null;
  gamesChecked: number | null;
  primaryGamesChecked: number | null;
  expandedGamesChecked: number | null;
  candidatesFound: number | null;
  baseCandidatesFound: number | null;
  eliteProbesChecked: number | null;
  qualifiedAfterSummary: number | null;
  storedCount: number | null;
  summaryFinalistsChecked: number | null;
  excludedGames: number | null;
  rejectedCached: number | null;
  totalApiRequestsMade: number | null;
  apiRequestsMade: number | null;
  primaryApiRequestsMade: number | null;
  expandedApiRequestsMade: number | null;
  totalRawGamesFetched: number | null;
  expandedRawGamesFetched: number | null;
  rawGamesFetched: number | null;
  primaryRawGamesFetched: number | null;
  totalSkippedAlreadyExcluded: number | null;
  skippedAlreadyExcluded: number | null;
  primarySkippedAlreadyExcluded: number | null;
  expandedSkippedAlreadyExcluded: number | null;
  totalSkippedLowRating: number | null;
  skippedLowRating: number | null;
  primarySkippedLowRating: number | null;
  expandedSkippedLowRating: number | null;
  totalSkippedInvalid: number | null;
  skippedInvalid: number | null;
  primarySkippedInvalid: number | null;
  expandedSkippedInvalid: number | null;
  totalEligibleGamesCollected: number | null;
  eligibleGamesCollected: number | null;
  primaryEligibleGamesCollected: number | null;
  expandedEligibleGamesCollected: number | null;
  freshGamesCollected: number | null;
  primaryFreshGamesCollected: number | null;
  expandedFreshGamesCollected: number | null;
  startPlayerOffset: number | null;
  primaryStartPlayerOffset: number | null;
  expandedStartPlayerOffset: number | null;
  nextPlayerOffset: number | null;
  primaryNextPlayerOffset: number | null;
  expandedNextPlayerOffset: number | null;
  playerBatchesChecked: number | null;
  primaryPlayerBatchesChecked: number | null;
  expandedPlayerBatchesChecked: number | null;
  ignoredGameTtlHours: number | null;
  lookbackHours: number | null;
  expandedLookback: boolean;
  selectedGameIds: string[];
  selectedGameUrls: Record<string, string>;
  message: string | null;
  error: string | null;
};

function toDate(value: Timestamp | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return value.toDate();
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function readScanRun(id: string, data: DocumentData): ScanRun {
  return {
    id,
    status: String(data.status ?? "unknown"),
    startedAt: toDate(data.startedAt),
    finishedAt: toDate(data.finishedAt),
    type: typeof data.type === "string" ? data.type : null,
    gamesChecked: numberOrNull(data.gamesChecked),
    primaryGamesChecked: numberOrNull(data.primaryGamesChecked),
    expandedGamesChecked: numberOrNull(data.expandedGamesChecked),
    candidatesFound: numberOrNull(data.candidatesFound),
    baseCandidatesFound: numberOrNull(data.baseCandidatesFound),
    eliteProbesChecked: numberOrNull(data.eliteProbesChecked),
    qualifiedAfterSummary: numberOrNull(data.qualifiedAfterSummary),
    storedCount: numberOrNull(data.storedCount),
    summaryFinalistsChecked: numberOrNull(data.summaryFinalistsChecked),
    excludedGames: numberOrNull(data.excludedGames),
    rejectedCached: numberOrNull(data.rejectedCached),
    totalApiRequestsMade: numberOrNull(data.totalApiRequestsMade),
    apiRequestsMade: numberOrNull(data.apiRequestsMade),
    primaryApiRequestsMade: numberOrNull(data.primaryApiRequestsMade),
    expandedApiRequestsMade: numberOrNull(data.expandedApiRequestsMade),
    totalRawGamesFetched: numberOrNull(data.totalRawGamesFetched),
    rawGamesFetched: numberOrNull(data.rawGamesFetched),
    primaryRawGamesFetched: numberOrNull(data.primaryRawGamesFetched),
    expandedRawGamesFetched: numberOrNull(data.expandedRawGamesFetched),
    totalSkippedAlreadyExcluded: numberOrNull(data.totalSkippedAlreadyExcluded),
    skippedAlreadyExcluded: numberOrNull(data.skippedAlreadyExcluded),
    primarySkippedAlreadyExcluded: numberOrNull(data.primarySkippedAlreadyExcluded),
    expandedSkippedAlreadyExcluded: numberOrNull(data.expandedSkippedAlreadyExcluded),
    totalSkippedLowRating: numberOrNull(data.totalSkippedLowRating),
    skippedLowRating: numberOrNull(data.skippedLowRating),
    primarySkippedLowRating: numberOrNull(data.primarySkippedLowRating),
    expandedSkippedLowRating: numberOrNull(data.expandedSkippedLowRating),
    totalSkippedInvalid: numberOrNull(data.totalSkippedInvalid),
    skippedInvalid: numberOrNull(data.skippedInvalid),
    primarySkippedInvalid: numberOrNull(data.primarySkippedInvalid),
    expandedSkippedInvalid: numberOrNull(data.expandedSkippedInvalid),
    totalEligibleGamesCollected: numberOrNull(data.totalEligibleGamesCollected),
    eligibleGamesCollected: numberOrNull(data.eligibleGamesCollected),
    primaryEligibleGamesCollected: numberOrNull(data.primaryEligibleGamesCollected),
    expandedEligibleGamesCollected: numberOrNull(data.expandedEligibleGamesCollected),
    freshGamesCollected: numberOrNull(data.freshGamesCollected),
    primaryFreshGamesCollected: numberOrNull(data.primaryFreshGamesCollected),
    expandedFreshGamesCollected: numberOrNull(data.expandedFreshGamesCollected),
    startPlayerOffset: numberOrNull(data.startPlayerOffset),
    primaryStartPlayerOffset: numberOrNull(data.primaryStartPlayerOffset),
    expandedStartPlayerOffset: numberOrNull(data.expandedStartPlayerOffset),
    nextPlayerOffset: numberOrNull(data.nextPlayerOffset),
    primaryNextPlayerOffset: numberOrNull(data.primaryNextPlayerOffset),
    expandedNextPlayerOffset: numberOrNull(data.expandedNextPlayerOffset),
    playerBatchesChecked: numberOrNull(data.playerBatchesChecked),
    primaryPlayerBatchesChecked: numberOrNull(data.primaryPlayerBatchesChecked),
    expandedPlayerBatchesChecked: numberOrNull(data.expandedPlayerBatchesChecked),
    ignoredGameTtlHours: numberOrNull(data.ignoredGameTtlHours),
    lookbackHours: numberOrNull(data.lookbackHours),
    expandedLookback: Boolean(data.expandedLookback),
    selectedGameIds: Array.isArray(data.selectedGameIds)
      ? data.selectedGameIds.filter((gameId: unknown): gameId is string => typeof gameId === "string")
      : typeof data.selectedGameId === "string"
        ? [data.selectedGameId]
        : [],
    selectedGameUrls: stringRecord(data.selectedGameUrls),
    message: typeof data.message === "string" ? data.message : null,
    error: typeof data.error === "string" ? data.error : null,
  };
}

function formatDate(value: Date | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "medium" }).format(value);
}

function formatDuration(startedAt: Date | null, finishedAt: Date | null) {
  if (!startedAt || !finishedAt) return "Unknown";
  const seconds = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function statusClass(status: string) {
  if (status === "success") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
  if (status === "failed") return "border-rose-300/25 bg-rose-400/10 text-rose-200";
  if (status === "running") return "border-sky-300/25 bg-sky-400/10 text-sky-200";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-slate-200">{value ?? "Unknown"}</dd>
    </div>
  );
}

export function ScanRunsView() {
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [resolvedGameUrls, setResolvedGameUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      setLoading(true);
      setError(null);
      try {
        const runsQuery = query(collection(db, "scanRuns"), orderBy("startedAt", "desc"), limit(50));
        const snapshot = await getDocs(runsQuery);
        if (cancelled) return;
        const nextRuns = snapshot.docs.map((doc) => readScanRun(doc.id, doc.data()));
        setRuns(nextRuns);

        const missingGameIds = Array.from(
          new Set(
            nextRuns
              .flatMap((run) => run.selectedGameIds)
              .filter((gameId) => !nextRuns.some((run) => run.selectedGameUrls[gameId])),
          ),
        );
        if (missingGameIds.length) {
          const urlEntries = await Promise.all(
            missingGameIds.map(async (gameId) => {
              const gameSnapshot = await getDoc(doc(db, "outlierGames", gameId));
              const url = gameSnapshot.exists() ? gameSnapshot.data().aoe4worldUrl : null;
              return typeof url === "string" ? ([gameId, url] as const) : null;
            }),
          );
          if (!cancelled) setResolvedGameUrls(Object.fromEntries(urlEntries.filter((entry): entry is [string, string] => Boolean(entry))));
        } else {
          setResolvedGameUrls({});
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load scan logs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRuns();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const latestStartedAt = useMemo(() => runs[0]?.startedAt ?? null, [runs]);

  if (loading) {
    return <EmptyState title="Loading scan logs" description="Fetching the latest scanner runs." />;
  }

  if (error) {
    return <EmptyState title="Could not load scan logs" description={error} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <span>
          Showing {runs.length} latest runs
          {latestStartedAt ? ` - newest started ${formatDate(latestStartedAt)}` : ""}
        </span>
        <button className={buttonClassName("ghost")} type="button" onClick={() => setRefreshKey((key) => key + 1)}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {runs.length ? (
        <div className="space-y-3">
          {runs.map((run) => (
            <article key={run.id} className="rounded-lg border border-white/10 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold uppercase", statusClass(run.status))}>
                      {run.status}
                    </span>
                    <span className="font-mono text-sm text-slate-400">{run.id}</span>
                  </div>
                  <p className="text-sm text-slate-300">{run.error ?? run.message ?? "No message recorded."}</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>{formatDate(run.startedAt)}</div>
                  <div>Duration: {formatDuration(run.startedAt, run.finishedAt)}</div>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5 lg:grid-cols-10">
                <Stat label="Games" value={run.gamesChecked} />
                <Stat label="Primary" value={run.primaryGamesChecked} />
                <Stat label="Fallback" value={run.expandedGamesChecked} />
                <Stat label="Qualified" value={run.candidatesFound} />
                <Stat label="Base" value={run.baseCandidatesFound} />
                <Stat label="Elite probes" value={run.eliteProbesChecked} />
                <Stat label="Stored" value={run.storedCount} />
                <Stat label="Summaries" value={run.summaryFinalistsChecked} />
                <Stat label="Excluded" value={run.excludedGames} />
                <Stat label="Rejected" value={run.rejectedCached} />
                <Stat label="Lookback" value={run.lookbackHours ? `${run.lookbackHours}h${run.expandedLookback ? " expanded" : ""}` : null} />
              </dl>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 md:grid-cols-4 lg:grid-cols-12">
                <Stat label="Total calls" value={run.totalApiRequestsMade ?? run.apiRequestsMade} />
                <Stat label="Primary calls" value={run.primaryApiRequestsMade} />
                <Stat label="Fallback calls" value={run.expandedApiRequestsMade} />
                <Stat label="Total raw" value={run.totalRawGamesFetched ?? run.rawGamesFetched} />
                <Stat label="Primary raw" value={run.primaryRawGamesFetched} />
                <Stat label="Fallback raw" value={run.expandedRawGamesFetched} />
                <Stat label="Total eligible" value={run.totalEligibleGamesCollected ?? run.eligibleGamesCollected ?? run.freshGamesCollected} />
                <Stat label="Primary eligible" value={run.primaryEligibleGamesCollected ?? run.primaryFreshGamesCollected} />
                <Stat label="Fallback eligible" value={run.expandedEligibleGamesCollected ?? run.expandedFreshGamesCollected} />
                <Stat label="Total cache" value={run.totalSkippedAlreadyExcluded ?? run.skippedAlreadyExcluded} />
                <Stat label="Total low Elo" value={run.totalSkippedLowRating ?? run.skippedLowRating} />
                <Stat label="Total invalid" value={run.totalSkippedInvalid ?? run.skippedInvalid} />
                <Stat label="Ignore TTL" value={run.ignoredGameTtlHours ? `${run.ignoredGameTtlHours}h` : null} />
                <Stat label="Start offset" value={run.startPlayerOffset} />
                <Stat label="Next offset" value={run.nextPlayerOffset} />
                <Stat label="Batches" value={run.playerBatchesChecked} />
              </dl>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 md:grid-cols-4 lg:grid-cols-9">
                <Stat label="Primary cache" value={run.primarySkippedAlreadyExcluded} />
                <Stat label="Fallback cache" value={run.expandedSkippedAlreadyExcluded} />
                <Stat label="Primary low Elo" value={run.primarySkippedLowRating} />
                <Stat label="Fallback low Elo" value={run.expandedSkippedLowRating} />
                <Stat label="Primary offset" value={run.primaryStartPlayerOffset} />
                <Stat label="Fallback offset" value={run.expandedStartPlayerOffset} />
                <Stat label="Primary next" value={run.primaryNextPlayerOffset} />
                <Stat label="Fallback next" value={run.expandedNextPlayerOffset} />
                <Stat label="Fallback batches" value={run.expandedPlayerBatchesChecked} />
              </dl>

              {run.selectedGameIds.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {run.selectedGameIds.map((gameId) => {
                    const gameUrl = run.selectedGameUrls[gameId] ?? resolvedGameUrls[gameId];
                    return gameUrl ? (
                      <a
                        key={gameId}
                        href={gameUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 font-mono text-xs text-sky-100 hover:border-sky-300/50"
                      >
                        {gameId}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span
                        key={gameId}
                        className="inline-flex items-center rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-slate-400"
                      >
                        {gameId}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No scan logs yet" description="Run the scanner once and this page will show the result." />
      )}
    </div>
  );
}
