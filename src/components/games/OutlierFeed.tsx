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
  latest48h?: boolean;
  bookmarkedOnly?: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_PREFIX = 'aoe4scanner:feed-cache:';
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

function hydrateGame(game: ReturnType<typeof serializeGame>): OutlierGame {
  return {
    ...game,
    startedAt: new Date(game.startedAt),
    selectedAt: new Date(game.selectedAt),
    expiresAt: new Date(game.expiresAt),
  };
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

function cacheKey(mode: FeedMode, pageSize?: number) {
  return `${CACHE_PREFIX}${JSON.stringify({ mode, pageSize })}`;
}

export function OutlierFeed({
  mode,
  filters = {},
  pageSize,
}: {
  mode: FeedMode;
  filters?: FeedFilters;
  pageSize?: number;
}) {
  const [games, setGames] = useState<OutlierGame[]>([]);
  const [status, setStatus] = useState<PublicStatus>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [spoilerLight, setSpoilerLight] = useState(false);

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
    const key = cacheKey(mode, pageSize);

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

        const clauses = [
          orderBy('selectedAt', 'desc'),
          limit(pageSize ?? (mode === 'latest' ? 10 : 250)),
        ];
        const gamesQuery = query(collection(db, 'outlierGames'), ...clauses);
        const [snapshot, statusSnapshot] = await Promise.all([
          getDocs(gamesQuery),
          getDoc(doc(db, 'meta', 'publicStatus')),
        ]);
        if (cancelled) return;
        const nextGames = snapshot.docs.map((gameDoc) => outlierFromSnapshot(gameDoc)).sort(newestPickedFirst);
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
  ]);

  const visibleGames = useMemo(
    () => games.filter((game) => matchesClientFilters(game, filters, bookmarks)).sort(newestPickedFirst),
    [bookmarks, filters, games],
  );

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
      ? `Showing ${visibleGames.length} latest games (Updated hourly)`
      : `${visibleGames.length} matching games`;

  if (loading) {
    return <EmptyState title='Loading outliers' description='Fetching the latest saved games.' />;
  }

  if (error) {
    return <EmptyState title='Could not load games' description={error} />;
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400'>
        <span>{countLabel}</span>
        <div className='flex flex-wrap items-center gap-3'>
          <span>Last successful scan: {lastScan}</span>
          <label className='flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-slate-300'>
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
      {visibleGames.length ? (
        <div className='space-y-4'>
          {visibleGames.map((outlier) => (
            <GameCard
              key={outlier.id}
              outlier={outlier}
              spoilerLight={spoilerLight}
              isNew={outlier.selectedAt.getTime() > lastSeenAt}
            />
          ))}
          <ScrollToTopButton />
        </div>
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
