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

type Highlight = {
  label: string;
  game: OutlierGame;
};

const COMEBACK_REASON_PATTERNS = [
  'comeback',
  'villager_deficit',
  'resource_deficit',
  'lost_multiple_landmarks',
  'won_after_losing_tc',
  'lost_tc',
];

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

function hasComebackSignal(game: OutlierGame) {
  return game.reasons.some((reason) => {
    const haystack = `${reason.type} ${reason.label}`.toLowerCase();
    return COMEBACK_REASON_PATTERNS.some((pattern) => haystack.includes(pattern));
  });
}

function bestBy(games: OutlierGame[], score: (game: OutlierGame) => number) {
  return [...games].sort((a, b) => score(b) - score(a) || b.score - a.score || b.selectedAt.getTime() - a.selectedAt.getTime())[0] ?? null;
}

function selectHighlights(games: OutlierGame[]) {
  const selectedIds = new Set<string>();
  const highlights: Highlight[] = [];

  function add(label: string, game: OutlierGame | null) {
    if (!game || selectedIds.has(game.id)) return;
    selectedIds.add(game.id);
    highlights.push({ label, game });
  }

  add('Highest Score', bestBy(games.filter((game) => game.score >= 100), (game) => game.score));
  add('Best Comeback', bestBy(games.filter((game) => !selectedIds.has(game.id) && hasComebackSignal(game)), (game) => game.score));
  add('Best Pro Match', bestBy(games.filter((game) => !selectedIds.has(game.id) && isEliteSavedGame(game)), (game) => game.score));
  add('Biggest Upset', bestBy(games.filter((game) => !selectedIds.has(game.id) && underdogMmrDiff(game) >= 150), underdogMmrDiff));

  return highlights;
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
        {highlights.map((highlight) => (
          <div key={`${highlight.label}-${highlight.game.id}`} className='space-y-2'>
            <span className='inline-flex rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-gold'>
              {highlight.label}
            </span>
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

function cacheKey(mode: FeedMode, pageSize?: number) {
  return `${CACHE_PREFIX}${JSON.stringify({ mode, pageSize })}`;
}

function highlightFromData(entry: unknown): Highlight | null {
  if (!entry || typeof entry !== 'object') return null;
  const data = entry as { label?: unknown; game?: unknown };
  if (typeof data.label !== 'string' || !data.game || typeof data.game !== 'object') return null;
  return {
    label: data.label,
    game: hydrateGame(data.game as Record<string, unknown>),
  };
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
  const [savedHighlights, setSavedHighlights] = useState<Highlight[]>([]);
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
            highlights?: Array<{ label: string; game: ReturnType<typeof serializeGame> }>;
            status: {
              lastSuccessfulScanAt?: string | null;
              lastScanMessage?: string | null;
              trackedPlayers?: number | null;
            };
          };
          if (Date.now() - parsed.storedAt < CACHE_TTL_MS) {
            setGames(parsed.games.map(hydrateGame));
            setSavedHighlights(parsed.highlights?.map((highlight) => ({ label: highlight.label, game: hydrateGame(highlight.game) })) ?? []);
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

        const fetchLimit = pageSize ?? (mode === 'latest' ? 10 : 250);
        const clauses = [
          orderBy('selectedAt', 'desc'),
          limit(fetchLimit),
        ];
        const gamesQuery = query(collection(db, 'outlierGames'), ...clauses);
        const highlightPromise = showHighlights
          ? getDoc(doc(db, 'meta', 'homepageHighlights')).catch(() => null)
          : Promise.resolve(null);
        const [snapshot, statusSnapshot, highlightsSnapshot] = await Promise.all([
          getDocs(gamesQuery),
          getDoc(doc(db, 'meta', 'publicStatus')),
          highlightPromise,
        ]);
        if (cancelled) return;
        const nextGames = snapshot.docs.map((gameDoc) => outlierFromSnapshot(gameDoc)).sort(newestPickedFirst);
        const nextStatus = statusFromData(statusSnapshot.data());
        const nextHighlights =
          highlightsSnapshot?.exists()
            ? ((highlightsSnapshot.data().highlights ?? []) as unknown[]).map(highlightFromData).filter((highlight): highlight is Highlight => Boolean(highlight))
            : [];
        localStorage.setItem(
          key,
          JSON.stringify({
            storedAt: Date.now(),
            games: nextGames.map(serializeGame),
            highlights: nextHighlights.map((highlight) => ({ label: highlight.label, game: serializeGame(highlight.game) })),
            status: {
              ...nextStatus,
              lastSuccessfulScanAt: nextStatus.lastSuccessfulScanAt?.toISOString() ?? null,
            },
          }),
        );
        setGames(nextGames);
        setSavedHighlights(nextHighlights);
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
  const feedGames = useMemo(() => (mode === 'latest' && pageSize ? visibleGames.slice(0, pageSize) : visibleGames), [mode, pageSize, visibleGames]);
  const highlights = useMemo(
    () => (showHighlights ? (savedHighlights.length ? savedHighlights : selectHighlights(games)) : []),
    [games, savedHighlights, showHighlights],
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
      ? `Showing ${feedGames.length} latest games (Updated hourly)`
      : `${feedGames.length} matching games`;

  if (loading) {
    return <EmptyState title='Loading outliers' description='Fetching the latest saved games.' />;
  }

  if (error) {
    return <EmptyState title='Could not load games' description={error} />;
  }

  return (
    <div className='space-y-4'>
      {highlights.length ? <HighlightsSection highlights={highlights} spoilerLight={spoilerLight} lastSeenAt={lastSeenAt} /> : null}
      {feedGames.length ? (
        <section className='space-y-3'>
          <div>
            <h2 className='text-xl font-black text-white'>Latest games</h2>
            <p className='text-sm text-slate-400'>The newest outlier games saved by the scanner.</p>
          </div>
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
          <div className='space-y-4'>
            {feedGames.map((outlier) => (
              <GameCard
                key={outlier.id}
                outlier={outlier}
                spoilerLight={spoilerLight}
                isNew={outlier.selectedAt.getTime() > lastSeenAt}
              />
            ))}
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
