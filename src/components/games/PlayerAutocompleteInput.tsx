"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type AutocompletePlayer = {
  name: string;
  profile_id: number;
  rating?: number | null;
  rank_level?: string | null;
};

const AUTOCOMPLETE_CACHE_PREFIX = "aoe4scanner:player-autocomplete:";
const AUTOCOMPLETE_CACHE_TTL_MS = 60 * 60 * 1000;
const AUTOCOMPLETE_REQUEST_TIMEOUT_MS = 8 * 1000;
const AUTOCOMPLETE_MAX_CACHE_ENTRIES = 24;
const autocompleteMemoryCache = new Map<string, { storedAt: number; players: AutocompletePlayer[] }>();

function rankLabel(value?: string | null) {
  return value ? value.replaceAll("_", " ") : "Unranked";
}

function readCachedPlayers(query: string) {
  const key = query.toLowerCase();
  const memory = autocompleteMemoryCache.get(key);
  if (memory && Date.now() - memory.storedAt < AUTOCOMPLETE_CACHE_TTL_MS) return memory.players;

  try {
    const cached = localStorage.getItem(`${AUTOCOMPLETE_CACHE_PREFIX}${key}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { storedAt: number; players: AutocompletePlayer[] };
    if (Date.now() - parsed.storedAt >= AUTOCOMPLETE_CACHE_TTL_MS) return null;
    autocompleteMemoryCache.set(key, parsed);
    return parsed.players;
  } catch {
    return null;
  }
}

function writeCachedPlayers(query: string, players: AutocompletePlayer[]) {
  const key = query.toLowerCase();
  const entry = { storedAt: Date.now(), players };
  autocompleteMemoryCache.set(key, entry);
  while (autocompleteMemoryCache.size > AUTOCOMPLETE_MAX_CACHE_ENTRIES) {
    const oldestKey = autocompleteMemoryCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    autocompleteMemoryCache.delete(oldestKey);
  }
  try {
    localStorage.setItem(`${AUTOCOMPLETE_CACHE_PREFIX}${key}`, JSON.stringify(entry));
    const cachedEntries: Array<{ key: string; storedAt: number }> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(AUTOCOMPLETE_CACHE_PREFIX)) continue;
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey) ?? "") as { storedAt?: unknown };
        cachedEntries.push({
          key: storageKey,
          storedAt: typeof cached.storedAt === "number" ? cached.storedAt : 0,
        });
      } catch {
        cachedEntries.push({ key: storageKey, storedAt: 0 });
      }
    }
    cachedEntries
      .sort((a, b) => b.storedAt - a.storedAt)
      .slice(AUTOCOMPLETE_MAX_CACHE_ENTRIES)
      .forEach((cached) => localStorage.removeItem(cached.key));
  } catch {
    // Cache writes are best-effort.
  }
}

export function PlayerAutocompleteInput({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [players, setPlayers] = useState<AutocompletePlayer[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const query = value.trim();
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (query.length < 3) {
      setPlayers([]);
      return;
    }

    const cachedPlayers = readCachedPlayers(query);
    if (cachedPlayers) {
      setPlayers(cachedPlayers);
      setOpen(true);
      return;
    }

    const controller = new AbortController();
    let requestTimeout: number | undefined;
    const timeout = window.setTimeout(async () => {
      requestTimeout = window.setTimeout(() => controller.abort(), AUTOCOMPLETE_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(
          `https://aoe4world.com/api/v0/players/autocomplete?leaderboard=rm_solo&query=${encodeURIComponent(query)}&limit=6`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as { players?: AutocompletePlayer[] };
        const nextPlayers = payload.players ?? [];
        writeCachedPlayers(query, nextPlayers);
        setPlayers(nextPlayers);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setPlayers([]);
      } finally {
        if (requestTimeout != null) window.clearTimeout(requestTimeout);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      if (requestTimeout != null) window.clearTimeout(requestTimeout);
    };
  }, [value]);

  return (
    <div ref={rootRef} className="relative">
      <div className="flex rounded-sm border border-[#2b332f] bg-[#0b0e0d] transition focus-within:border-gold">
        <Search className="ml-3 mt-3 h-4 w-4 text-[#686d66]" />
        <input
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => players.length && setOpen(true)}
          autoComplete="off"
          placeholder="Player name…"
          className="h-10 min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[#e8e3d4] outline-none placeholder:text-[#686d66]"
        />
      </div>
      {open && players.length ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-sm border border-[#2b332f] bg-[#121715] shadow-2xl">
          {players.map((player) => (
            <button
              key={player.profile_id}
              type="button"
              onClick={() => {
                skipNextFetchRef.current = true;
                setValue(player.name);
                setPlayers([]);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#1b211e]"
            >
              <span className="min-w-0 truncate font-medium text-[#e8e3d4]">{player.name}</span>
              <span className="shrink-0 text-xs capitalize text-[#777b74]">
                {player.rating ?? "?"} - {rankLabel(player.rank_level)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
