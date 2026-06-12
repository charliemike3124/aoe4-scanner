'use client';

import { useEffect, useMemo, useState } from 'react';
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
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const ARCHIVE_PAGE_SIZE = 20;
const CACHE_PREFIX = 'aoe4scanner:feed-cache:v2:';
const BOOKMARKS_KEY = 'aoe4scanner:bookmarks';
const LAST_SEEN_KEY = 'aoe4scanner:last-seen-selected-at';
const SPOILER_KEY = 'aoe4scanner:spoiler-light';

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

function matchesClientFilters(game: OutlierGame, filters: FeedFilters, bookmarks: Set<string>) {
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    if (!game.players.some((player) => player.name.toLowerCase().includes(needle))) return false;
  }
  if (filters.civilization && !game.civilizations.includes(filters.civilization)) return false;
  if (filters.map && !game.map?.toLowerCase().includes(filters.map.toLowerCase())) return false;
  if (filters.latest48h && game.startedAt.getTime() < Date.now() - 48 * 60 * 60 * 1000) return false;
  if (filters.minScore != null && game.score < filters.minScore) return false;
  if (filters.maxScore != null && game.score > filters.maxScore) return false;
  if (filters.strategy && !game.reasons.some((reason) => reason.type === filters.strategy)) return false;
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
  const highlights: Highlight[] = [];

  function addMany(label: string, nextGames: OutlierGame[]) {
    for (const game of nextGames) {
      highlights.push({ label, game });
    }
  }

  addMany('Top 3 highest scores', topBy(games.filter((game) => game.score >= 100), (game) => game.score));
  addMany('Top 3 pro matches', topBy(games.filter((game) => isEliteSavedGame(game)), (game) => game.score));
  addMany('Top 3 biggest upsets', topBy(games.filter((game) => underdogMmrDiff(game) >= 150), underdogMmrDiff));

  return highlights;
}

function groupedHighlights(highlights: Highlight[]) {
  const groups: Array<{ label: string; games: OutlierGame[] }> = [];
  for (const highlight of highlights) {
    const group = groups.find((entry) => entry.label === highlight.label);
    if (group) group.games.push(highlight.game);
    else groups.push({ label: highlight.label, games: [highlight.game] });
  }
  return groups;
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
    <section className='space-y-3'>
      <div>
        <h2 className='text-xl font-black text-white'>Highlights</h2>
        <p className='text-sm text-slate-400'>Quick picks from the currently saved outlier games.</p>
      </div>
      <div className='space-y-4'>
        {groupedHighlights(highlights).map((group) => (
          <div key={group.label} className='space-y-3'>
            <span className='inline-flex rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-gold'>
              {group.label}
            </span>
            <div className='space-y-4'>
              {group.games.map((game) => (
                <GameCard
                  key={game.id}
                  outlier={game}
                  spoilerLight={spoilerLight}
                  isNew={game.selectedAt.getTime() > lastSeenAt}
                />
              ))}
            </div>
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
}: {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className='flex flex-wrap items-center justify-center gap-3 text-sm text-slate-300'>
      <button
        type='button'
        onClick={onPrevious}
        disabled={currentPage === 1}
        className='rounded-md border border-white/10 px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40'
      >
        Previous
      </button>
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <button
        type='button'
        onClick={onNext}
        disabled={currentPage === totalPages}
        className='rounded-md border border-white/10 px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40'
      >
        Next
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

  useEffect(() => {
    setBookmarks(readBookmarks());
    setLastSeenAt(Number(localStorage.getItem(LAST_SEEN_KEY) ?? 0));
    setSpoilerLight(localStorage.getItem(SPOILER_KEY) === 'true');

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
        const cached = localStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            storedAt: number;
            games: ReturnType<typeof serializeGame>[];
            status: {
              lastSuccessfulScanAt?: string | null;
              lastScanMessage?: string | null;
              trackedPlayers?: number | null;
            };
          };
          if (Date.now() - parsed.storedAt < CACHE_TTL_MS) {
            setGames(parsed.games.map(hydrateGame));
            setStatus({
              ...parsed.status,
              lastSuccessfulScanAt: parsed.status.lastSuccessfulScanAt
                ? new Date(parsed.status.lastSuccessfulScanAt)
                : null,
            });
            setLoading(false);
            return;
          }
        }

        const fetchLimit = mode === 'archive' || showHighlights ? 250 : pageSize ?? 15;
        const gamesQuery = query(collection(db, 'outlierGames'), orderBy('selectedAt', 'desc'), limit(fetchLimit));
        const archiveSnapshotPromise = mode === 'archive' || showHighlights
          ? getDoc(doc(db, 'meta', 'archiveSnapshot')).catch(() => null)
          : Promise.resolve(null);
        const [archiveSnapshot, statusSnapshot] = await Promise.all([
          archiveSnapshotPromise,
          getDoc(doc(db, 'meta', 'publicStatus')),
        ]);
        if (cancelled) return;
        let nextGames =
          archiveSnapshot?.exists() && Array.isArray(archiveSnapshot.data().games)
            ? (archiveSnapshot.data().games as unknown[]).map((game) => hydrateGame(game as Record<string, unknown>))
            : [];
        if (!nextGames.length) {
          const snapshot = await getDocs(gamesQuery);
          if (cancelled) return;
          nextGames = snapshot.docs.map((gameDoc) => outlierFromSnapshot(gameDoc));
        }
        nextGames = nextGames.sort(newestPickedFirst).slice(0, fetchLimit);
        const nextStatus = statusFromData(statusSnapshot.data());
        localStorage.setItem(
          key,
          JSON.stringify({
            storedAt: Date.now(),
            games: nextGames.map(serializeGame),
            status: {
              ...nextStatus,
              lastSuccessfulScanAt: nextStatus.lastSuccessfulScanAt?.toISOString() ?? null,
            },
          }),
        );
        setGames(nextGames);
        setStatus(nextStatus);
      } catch (caught) {
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

  const visibleGames = useMemo(
    () => games.filter((game) => matchesClientFilters(game, filters, bookmarks)).sort(filters.sort === 'score' ? scoreFirst : newestPickedFirst),
    [bookmarks, filters, games],
  );
  const filterKey = JSON.stringify(filters);
  const totalPages = Math.max(1, Math.ceil(visibleGames.length / ARCHIVE_PAGE_SIZE));
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
  }, [bookmarks, filterKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!visibleGames.length) return;
    const maxSelectedAt = Math.max(...visibleGames.map((game) => game.selectedAt.getTime()));
    const timeout = window.setTimeout(() => {
      localStorage.setItem(LAST_SEEN_KEY, String(maxSelectedAt));
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
    localStorage.setItem(SPOILER_KEY, String(next));
  }

  const countLabel =
    mode === 'latest'
      ? 'Games are updated every hour'
      : visibleGames.length
        ? `Showing ${(currentPage - 1) * ARCHIVE_PAGE_SIZE + 1}-${(currentPage - 1) * ARCHIVE_PAGE_SIZE + feedGames.length} of ${visibleGames.length} matching games`
        : 'No matching games';
  const showPagination = mode === 'archive' && totalPages > 1;
  const goToPreviousPage = () => setCurrentPage((page) => Math.max(1, page - 1));
  const goToNextPage = () => setCurrentPage((page) => Math.min(totalPages, page + 1));

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
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-400'>
        <span>{countLabel}</span>
        <div className='flex flex-wrap items-center gap-3'>
          <span>Last successful scan: {lastScan}</span>
          <label className='flex items-center gap-2 rounded-md border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-slate-300'>
            <input
              type='checkbox'
              checked={spoilerLight}
              onChange={toggleSpoilerLight}
              className='h-4 w-4 accent-sky-400'
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
        />
      ) : null}
      {highlights.length ? <HighlightsSection highlights={highlights} spoilerLight={spoilerLight} lastSeenAt={lastSeenAt} /> : null}
      {feedGames.length ? (
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
              />
            ) : null}
            <ScrollToTopButton />
          </div>
        </section>
      ) : (
        <EmptyState
          title='No outlier games saved yet'
          description={
            filters.bookmarkedOnly
              ? 'No bookmarked games match these filters yet.'
              : 'Run the scanner to seed the first card.'
          }
        />
      )}
    </div>
  );
}
