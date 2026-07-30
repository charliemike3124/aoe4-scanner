'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { GameCard } from '@/components/games/GameCard';
import { EmptyState } from '@/components/games/EmptyState';
import { LoadingState } from '@/components/games/LoadingState';
import { ScrollToTopButton } from '@/components/ScrollToTopButton';
import { db } from '@/lib/firebase';
import { outlierFromSnapshot, statusFromData } from '@/lib/firestoreConverters';
import type { OutlierGame, PublicStatus } from '@/lib/types';

type FeedMode = 'latest' | 'archive';

type FeedFilters = {
  q?: string;
  civilization?: string;
  opponentCivilization?: string;
  map?: string;
  minElo?: number;
  maxElo?: number;
  minScore?: number;
  maxScore?: number;
  strategy?: string;
  sort?: 'newest' | 'score';
  latest48h?: boolean;
  bookmarkedOnly?: boolean;
  upsetsOnly?: boolean;
  civMainsOnly?: boolean;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const ARCHIVE_PAGE_SIZE = 10;
const ARCHIVE_SNAPSHOT_SHARD_SIZE = 100;
const CACHE_PREFIX = 'aoe4scanner:feed-cache:v4:';
const BOOKMARKS_KEY = 'aoe4scanner:bookmarks';
const LAST_SEEN_KEY = 'aoe4scanner:last-seen-selected-at';
const SPOILER_KEY = 'aoe4scanner:spoiler-light';
const HIGHLIGHT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const HIGHLIGHT_CANDIDATE_LIMIT = 25;
const HIGHLIGHT_COUNT = 5;

function readStorageValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJsonCache<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Browser storage is an optional optimization.
  }
}

function serializeGame(game: OutlierGame) {
  return {
    ...game,
    startedAt: game.startedAt.toISOString(),
    selectedAt: game.selectedAt.toISOString(),
    expiresAt: game.expiresAt.toISOString(),
  };
}

function hydrateDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (value && typeof value === 'object') {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp.toDate === 'function') return maybeTimestamp.toDate();
    if (typeof maybeTimestamp.seconds === 'number') {
      return new Date(maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1000000));
    }
  }
  return new Date(0);
}

function hydrateGame(game: ReturnType<typeof serializeGame> | Record<string, unknown>): OutlierGame {
  return {
    ...game,
    startedAt: hydrateDate(game.startedAt),
    selectedAt: hydrateDate(game.selectedAt),
    expiresAt: hydrateDate(game.expiresAt),
  } as OutlierGame;
}

function readBookmarks() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set<string>();
  }
}

function reasonMatchesStrategy(reasonType: string, strategy: string) {
  return reasonType === strategy || reasonType.startsWith(`${strategy}_`);
}

function matchesCivilizations(game: OutlierGame, civilization?: string, opponentCivilization?: string) {
  const selectedCivilizations = [civilization, opponentCivilization].filter(
    (value): value is string => Boolean(value),
  );
  if (!selectedCivilizations.length) return true;

  if (selectedCivilizations.length === 1) {
    return game.players.some((player) => player.civilization === selectedCivilizations[0]);
  }

  if (selectedCivilizations[0] === selectedCivilizations[1]) {
    return game.players.filter((player) => player.civilization === selectedCivilizations[0]).length >= 2;
  }

  return selectedCivilizations.every((selectedCivilization) =>
    game.players.some((player) => player.civilization === selectedCivilization),
  );
}

function matchesClientFilters(game: OutlierGame, filters: FeedFilters, bookmarks: Set<string>) {
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    if (!game.players.some((player) => player.name.toLowerCase().includes(needle))) return false;
  }
  if (!matchesCivilizations(game, filters.civilization, filters.opponentCivilization)) return false;
  if (filters.civMainsOnly) {
    const mainCivilization = filters.civilization ?? filters.opponentCivilization;
    const hasMatchingMain = game.players.some((player) => {
      const mainCiv = player.civilizationMain?.civilization;
      if (!mainCiv) return false;
      if (player.civilization !== mainCiv) return false;
      return mainCivilization ? player.civilization === mainCivilization : true;
    });
    if (!hasMatchingMain) return false;
  }
  if (filters.map && !game.map?.toLowerCase().includes(filters.map.toLowerCase())) return false;
  if (filters.latest48h && game.startedAt.getTime() < Date.now() - 48 * 60 * 60 * 1000) return false;
  if (filters.minScore != null && game.score < filters.minScore) return false;
  if (filters.maxScore != null && game.score > filters.maxScore) return false;
  if (filters.strategy && !game.reasons.some((reason) => reasonMatchesStrategy(reason.type, filters.strategy!))) return false;
  if (filters.upsetsOnly && !game.reasons.some((reason) => reason.type.toLowerCase().includes('upset') || reason.label.toLowerCase().includes('underdog'))) {
    return false;
  }
  const playerRatings = game.players
    .map((player) => player.rating)
    .filter((rating): rating is number => rating != null);
  if (
    (filters.minElo != null || filters.maxElo != null) &&
    !playerRatings.some((rating) => {
      if (filters.minElo != null && rating < filters.minElo) return false;
      if (filters.maxElo != null && rating > filters.maxElo) return false;
      return true;
    })
  ) {
    return false;
  }
  if (filters.bookmarkedOnly && !bookmarks.has(game.id)) return false;
  return true;
}

function newestPickedFirst(a: OutlierGame, b: OutlierGame) {
  return b.selectedAt.getTime() - a.selectedAt.getTime() || b.startedAt.getTime() - a.startedAt.getTime();
}

function scoreFirst(a: OutlierGame, b: OutlierGame) {
  return b.score - a.score || newestPickedFirst(a, b);
}

type Highlight = {
  label: string;
  game: OutlierGame;
};

function winnerAndLoser(game: OutlierGame) {
  return {
    winner: game.players.find((player) => player.result?.toLowerCase() === 'win'),
    loser: game.players.find((player) => player.result?.toLowerCase() === 'loss'),
  };
}

function underdogMmrDiff(game: OutlierGame) {
  const { winner, loser } = winnerAndLoser(game);
  if (winner?.mmr == null || loser?.mmr == null || winner.mmr >= loser.mmr) return 0;
  return loser.mmr - winner.mmr;
}

function isEliteSavedGame(game: OutlierGame) {
  const mmrs = game.players.map((player) => player.mmr);
  return mmrs.length >= 2 && mmrs.every((mmr) => mmr != null && mmr >= 2000);
}

function topBy(games: OutlierGame[], score: (game: OutlierGame) => number, count = 3) {
  return [...games]
    .sort((a, b) => score(b) - score(a) || b.score - a.score || b.selectedAt.getTime() - a.selectedAt.getTime())
    .slice(0, count);
}

function selectHighlights(games: OutlierGame[]) {
  const freshGames = games.filter((game) => game.selectedAt.getTime() >= Date.now() - HIGHLIGHT_MAX_AGE_MS);
  return topBy(freshGames, (game) => underdogMmrDiff(game) * 2 + game.score, HIGHLIGHT_COUNT)
    .map((game) => ({ label: underdogMmrDiff(game) >= 150 ? 'Major upset' : isEliteSavedGame(game) ? 'Elite match' : 'Standout game', game }));
}

function HighlightsSection({
  highlights,
  spoilerLight,
  lastSeenAt,
}: {
  highlights: Highlight[];
  spoilerLight: boolean;
  lastSeenAt: number;
}) {
  return (
    <section className='space-y-5'>
      <div className='space-y-5'>
        {highlights.map((highlight, index) => (
          <div key={highlight.game.id} className='space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-[10px] font-bold uppercase tracking-[0.16em] text-gold'>{highlight.label}</span>
              <span className='text-[10px] font-bold uppercase tracking-[0.16em] text-[#777b74]'>Today&apos;s #{index + 1}</span>
            </div>
            <GameCard
              outlier={highlight.game}
              spoilerLight={spoilerLight}
              isNew={highlight.game.selectedAt.getTime() > lastSeenAt}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function cacheKey(mode: FeedMode, pageSize?: number, showHighlights = false) {
  return `${CACHE_PREFIX}${JSON.stringify({ mode, pageSize, showHighlights })}`;
}

function PaginationControls({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  loadingNext = false,
}: {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  loadingNext?: boolean;
}) {
  return (
    <div className='flex flex-wrap items-center justify-center gap-3 text-xs text-[#9ea097]'>
      <button
        type='button'
        onClick={onPrevious}
        disabled={currentPage === 1}
        className='rounded-sm border border-[#2b332f] px-3 py-2 font-bold uppercase tracking-wide text-[#e8e3d4] disabled:cursor-not-allowed disabled:opacity-40'
      >
        Previous
      </button>
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <button
        type='button'
        onClick={onNext}
        disabled={currentPage === totalPages || loadingNext}
        className='rounded-sm border border-[#2b332f] px-3 py-2 font-bold uppercase tracking-wide text-[#e8e3d4] disabled:cursor-not-allowed disabled:opacity-40'
      >
        {loadingNext ? 'Loading…' : 'Next'}
      </button>
    </div>
  );
}

export function OutlierFeed({
  mode,
  filters = {},
  pageSize,
  showHighlights = false,
}: {
  mode: FeedMode;
  filters?: FeedFilters;
  pageSize?: number;
  showHighlights?: boolean;
}) {
  const [games, setGames] = useState<OutlierGame[]>([]);
  const [status, setStatus] = useState<PublicStatus>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [spoilerLight, setSpoilerLight] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [archiveCount, setArchiveCount] = useState(0);
  const [archiveShardCount, setArchiveShardCount] = useState(1);
  const [loadedArchiveShards, setLoadedArchiveShards] = useState(1);
  const [loadingOlderGames, setLoadingOlderGames] = useState(false);
  const [olderGamesError, setOlderGamesError] = useState<string | null>(null);

  useEffect(() => {
    setBookmarks(readBookmarks());
    setLastSeenAt(Number(readStorageValue(LAST_SEEN_KEY) ?? 0));
    setSpoilerLight(readStorageValue(SPOILER_KEY) === 'true');

    function onBookmarksChanged() {
      setBookmarks(readBookmarks());
    }

    window.addEventListener('aoe4scanner:bookmarks-changed', onBookmarksChanged);
    return () => window.removeEventListener('aoe4scanner:bookmarks-changed', onBookmarksChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const key = cacheKey(mode, pageSize, showHighlights);

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const parsed = readJsonCache<{
          storedAt: number;
          games: ReturnType<typeof serializeGame>[];
          status: {
            lastSuccessfulScanAt?: string | null;
            lastScanMessage?: string | null;
            trackedPlayers?: number | null;
          };
          archiveCount?: number;
          archiveShardCount?: number;
          loadedArchiveShards?: number;
        }>(key);
        if (parsed && Date.now() - parsed.storedAt < CACHE_TTL_MS) {
          setGames(parsed.games.map(hydrateGame));
          setStatus({
            ...parsed.status,
            lastSuccessfulScanAt: parsed.status.lastSuccessfulScanAt
              ? new Date(parsed.status.lastSuccessfulScanAt)
              : null,
          });
          setArchiveCount(parsed.archiveCount ?? parsed.games.length);
          setArchiveShardCount(parsed.archiveShardCount ?? 1);
          setLoadedArchiveShards(parsed.loadedArchiveShards ?? 1);
          setLoading(false);
          return;
        }

        const fetchLimit = mode === 'archive' ? 250 : showHighlights ? HIGHLIGHT_CANDIDATE_LIMIT : pageSize ?? 15;
        const gamesQuery = query(collection(db, 'outlierGames'), orderBy('selectedAt', 'desc'), limit(fetchLimit));
        const feedSnapshotPromise = getDoc(
          doc(db, 'meta', mode === 'archive' ? 'archiveSnapshot' : 'homepageHighlights'),
        ).catch(() => null);
        const [feedSnapshot, statusSnapshot] = await Promise.all([
          feedSnapshotPromise,
          getDoc(doc(db, 'meta', 'publicStatus')),
        ]);
        if (cancelled) return;
        let nextGames =
          feedSnapshot?.exists() && Array.isArray(feedSnapshot.data().games)
            ? (feedSnapshot.data().games as unknown[]).map((game) => hydrateGame(game as Record<string, unknown>))
            : [];
        if (!nextGames.length) {
          const snapshot = await getDocs(gamesQuery);
          if (cancelled) return;
          nextGames = snapshot.docs.map((gameDoc) => outlierFromSnapshot(gameDoc));
        }
        nextGames = nextGames.sort(newestPickedFirst).slice(0, fetchLimit);
        const archiveData = mode === 'archive' && feedSnapshot?.exists() ? feedSnapshot.data() : undefined;
        const nextArchiveCount =
          mode === 'archive' ? Number(archiveData?.count ?? nextGames.length) : nextGames.length;
        const nextArchiveShardCount =
          mode === 'archive' ? Math.max(1, Number(archiveData?.shardCount ?? 1)) : 1;
        const nextStatus = statusFromData(statusSnapshot.data());
        writeStorageValue(
          key,
          JSON.stringify({
            storedAt: Date.now(),
            games: nextGames.map(serializeGame),
            status: {
              ...nextStatus,
              lastSuccessfulScanAt: nextStatus.lastSuccessfulScanAt?.toISOString() ?? null,
            },
            archiveCount: nextArchiveCount,
            archiveShardCount: nextArchiveShardCount,
            loadedArchiveShards: 1,
          }),
        );
        setGames(nextGames);
        setStatus(nextStatus);
        setArchiveCount(nextArchiveCount);
        setArchiveShardCount(nextArchiveShardCount);
        setLoadedArchiveShards(1);
      } catch {
        if (!cancelled)
          setError('The archive could not load right now. Try refreshing the page in a moment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    pageSize,
    showHighlights,
  ]);

  const filterKey = JSON.stringify(filters);
  const filtersRequireFullArchive =
    mode === 'archive' &&
    (filters.sort === 'score' ||
      Object.entries(filters).some(([key, value]) => {
        if (key === 'sort') return false;
        return value !== undefined && value !== false && value !== '';
      }));

  const loadArchiveShardsThrough = useCallback(
    async (targetShardCount: number) => {
      if (
        mode !== 'archive' ||
        loadedArchiveShards >= archiveShardCount
      ) {
        return true;
      }
      if (loadingOlderGames) return false;

      const end = Math.min(targetShardCount, archiveShardCount);
      if (end <= loadedArchiveShards) return true;

      setLoadingOlderGames(true);
      setOlderGamesError(null);
      try {
        const shardSnapshots = await Promise.all(
          Array.from({ length: end - loadedArchiveShards }, (_, offset) =>
            getDoc(doc(db, 'meta', `archiveSnapshot${loadedArchiveShards + offset}`)),
          ),
        );
        const olderGames = shardSnapshots.flatMap((snapshot) =>
          snapshot.exists() && Array.isArray(snapshot.data().games)
            ? (snapshot.data().games as unknown[]).map((game) =>
                hydrateGame(game as Record<string, unknown>),
              )
            : [],
        );
        setGames((currentGames) => {
          const byId = new Map(currentGames.map((game) => [game.id, game]));
          olderGames.forEach((game) => byId.set(game.id, game));
          return Array.from(byId.values()).sort(newestPickedFirst);
        });
        setLoadedArchiveShards(end);
        return true;
      } catch {
        setOlderGamesError('Older archive games could not be loaded. Please try again.');
        return false;
      } finally {
        setLoadingOlderGames(false);
      }
    },
    [archiveShardCount, loadedArchiveShards, loadingOlderGames, mode],
  );

  useEffect(() => {
    if (
      !filtersRequireFullArchive ||
      loadedArchiveShards >= archiveShardCount ||
      loadingOlderGames ||
      olderGamesError
    ) {
      return;
    }
    void loadArchiveShardsThrough(archiveShardCount);
  }, [
    archiveShardCount,
    filtersRequireFullArchive,
    loadArchiveShardsThrough,
    loadedArchiveShards,
    loadingOlderGames,
    olderGamesError,
  ]);

  const visibleGames = useMemo(
    () => games.filter((game) => matchesClientFilters(game, filters, bookmarks)).sort(filters.sort === 'score' ? scoreFirst : newestPickedFirst),
    [bookmarks, filters, games],
  );
  const archiveFullyLoaded = loadedArchiveShards >= archiveShardCount;
  const unfilteredNewestArchive = mode === 'archive' && !filtersRequireFullArchive;
  const resultCount = unfilteredNewestArchive ? archiveCount : visibleGames.length;
  const totalPages = Math.max(1, Math.ceil(resultCount / ARCHIVE_PAGE_SIZE));
  const feedGames = useMemo(() => {
    if (mode === 'latest') return visibleGames.slice(0, pageSize ?? 15);
    const start = (currentPage - 1) * ARCHIVE_PAGE_SIZE;
    return visibleGames.slice(start, start + ARCHIVE_PAGE_SIZE);
  }, [currentPage, mode, pageSize, visibleGames]);
  const highlights = useMemo(
    () => (showHighlights ? selectHighlights(games) : []),
    [games, showHighlights],
  );

  useEffect(() => {
    setCurrentPage(1);
    setOlderGamesError(null);
  }, [bookmarks, filterKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!visibleGames.length) return;
    const maxSelectedAt = Math.max(...visibleGames.map((game) => game.selectedAt.getTime()));
    const timeout = window.setTimeout(() => {
      writeStorageValue(LAST_SEEN_KEY, String(maxSelectedAt));
      setLastSeenAt(maxSelectedAt);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [visibleGames]);

  const lastScan = useMemo(() => {
    if (!status.lastSuccessfulScanAt) return 'Waiting for first scan';
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
      status.lastSuccessfulScanAt,
    );
  }, [status.lastSuccessfulScanAt]);

  function toggleSpoilerLight() {
    const next = !spoilerLight;
    setSpoilerLight(next);
    writeStorageValue(SPOILER_KEY, String(next));
  }

  const countLabel =
    mode === 'latest'
      ? 'Games are updated every hour'
      : loadingOlderGames && filtersRequireFullArchive && !archiveFullyLoaded
        ? `Loading all ${archiveCount} archived games for these filters…`
        : resultCount
          ? `Showing ${(currentPage - 1) * ARCHIVE_PAGE_SIZE + 1}-${(currentPage - 1) * ARCHIVE_PAGE_SIZE + feedGames.length} of ${resultCount} matching games`
      : 'No matching games';
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'sort') return false;
    return value !== undefined && value !== false && value !== '';
  });
  const showPagination = mode === 'archive' && totalPages > 1;
  function changePage(nextPageFor: (page: number) => number) {
    setCurrentPage((page) => {
      const nextPage = nextPageFor(page);
      if (nextPage !== page) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      }
      return nextPage;
    });
  }
  const goToPreviousPage = () => changePage((page) => Math.max(1, page - 1));
  async function goToNextPage() {
    const nextPage = Math.min(totalPages, currentPage + 1);
    if (nextPage === currentPage) return;
    if (mode === 'archive') {
      const requiredShardCount = Math.min(
        archiveShardCount,
        Math.max(
          1,
          Math.ceil((nextPage * ARCHIVE_PAGE_SIZE) / ARCHIVE_SNAPSHOT_SHARD_SIZE),
        ),
      );
      if (requiredShardCount > loadedArchiveShards) {
        const loaded = await loadArchiveShardsThrough(requiredShardCount);
        if (!loaded) return;
      }
    }
    setCurrentPage(nextPage);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  if (loading) {
    return (
      <LoadingState
        count={mode === 'latest' ? pageSize ?? 15 : ARCHIVE_PAGE_SIZE}
        showHighlights={showHighlights}
      />
    );
  }

  if (error) {
    return <EmptyState title='Could not load games' description={error} />;
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 border border-[#2b332f] bg-[#171c19] px-4 py-3 text-xs text-[#9ea097]'>
        <span>{countLabel}</span>
        <div className='flex flex-wrap items-center gap-3'>
          <span>Last updated {lastScan}</span>
          <label className='flex items-center gap-2 rounded-sm border border-[#2b332f] bg-[#0b0e0d] px-3 py-2 text-[#e8e3d4]'>
            <input
              type='checkbox'
              checked={spoilerLight}
              onChange={toggleSpoilerLight}
              className='h-4 w-4 accent-gold'
            />
            Spoiler-light
          </label>
        </div>
      </div>
      {showPagination ? (
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevious={goToPreviousPage}
          onNext={goToNextPage}
          loadingNext={loadingOlderGames}
        />
      ) : null}
      {olderGamesError ? (
        <div className='border border-[#563039] bg-[#211517] px-4 py-3 text-xs text-[#e6a397]'>
          {olderGamesError}
        </div>
      ) : null}
      {highlights.length ? <HighlightsSection highlights={highlights} spoilerLight={spoilerLight} lastSeenAt={lastSeenAt} /> : null}
      {!showHighlights && feedGames.length ? (
        <section className='space-y-3'>
          {mode === 'latest' ? (
            <div>
              <h2 className='text-xl font-black text-white'>Top 3 most recent games</h2>
              <p className='text-sm text-slate-400'>The newest outlier games saved by the scanner.</p>
            </div>
          ) : null}
          <div className='space-y-4'>
            {feedGames.map((outlier) => (
              <GameCard
                key={outlier.id}
                outlier={outlier}
                compact={mode === 'archive'}
                spoilerLight={spoilerLight}
                isNew={outlier.selectedAt.getTime() > lastSeenAt}
              />
            ))}
            {showPagination ? (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onPrevious={goToPreviousPage}
                onNext={goToNextPage}
                loadingNext={loadingOlderGames}
              />
            ) : null}
            <ScrollToTopButton />
          </div>
        </section>
      ) : !showHighlights ? (
        <EmptyState
          title={hasActiveFilters ? 'No games found' : 'No games available yet'}
          description={
            filters.bookmarkedOnly
              ? 'No bookmarked games match the selected filters.'
              : hasActiveFilters
                ? 'No saved games match the selected filters. Try adjusting or clearing some filters.'
                : 'There are no analyzed games to show right now. Please check back later.'
          }
        />
      ) : null}
    </div>
  );
}
