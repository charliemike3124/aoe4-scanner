"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, type Timestamp } from "firebase/firestore";
import { ExternalLink, Gamepad2, LinkIcon, Twitch, Youtube } from "lucide-react";
import { CIVILIZATION_FLAGS, CIVILIZATIONS, type Civilization } from "@/lib/aoe4/civilizations";
import { formatCivilization } from "@/lib/format";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

type MainPlayer = {
  profileId: string;
  name: string;
  civilization: string | null;
  rating: number | null;
  mmr: number | null;
  inputType: string | null;
  social: Record<string, string>;
  main: {
    civilization: string;
    pickRate: number;
    gamesCount: number;
    winRate: number | null;
  };
  lastSeenAt: Date | null;
  archivedMatches: number;
  latestMatchAt: Date | null;
};

const DIRECTORY_CACHE_KEY = "aoe4scanner:civilization-mains:v1";
const DIRECTORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function dateValue(value: Timestamp | Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return value.toDate();
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mainPlayerFromData(data: Record<string, unknown>, fallbackId: string): MainPlayer | null {
  const main = data.main as Record<string, unknown> | null | undefined;
  if (!main?.civilization || typeof main.pickRate !== "number" || typeof main.gamesCount !== "number") return null;
  return {
    profileId: String(data.profileId ?? fallbackId),
    name: String(data.name ?? `Player ${fallbackId}`),
    civilization: typeof data.civilization === "string" ? data.civilization : null,
    rating: numberValue(data.rating),
    mmr: numberValue(data.mmr),
    inputType: typeof data.inputType === "string" ? data.inputType : null,
    social: data.social && typeof data.social === "object" ? (data.social as Record<string, string>) : {},
    main: {
      civilization: String(main.civilization),
      pickRate: Number(main.pickRate),
      gamesCount: Number(main.gamesCount),
      winRate: numberValue(main.winRate),
    },
    lastSeenAt: dateValue((data.lastSeenAt ?? data.refreshedAt) as Timestamp | Date | string | null | undefined),
    archivedMatches: 0,
    latestMatchAt: null,
  };
}

function readCachedDirectory() {
  try {
    const raw = localStorage.getItem(DIRECTORY_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as {
      storedAt: number;
      players: Array<Omit<MainPlayer, "lastSeenAt" | "latestMatchAt"> & { lastSeenAt: string | null }>;
    };
    if (Date.now() - cached.storedAt > DIRECTORY_CACHE_TTL_MS) return null;
    return cached.players.map((player) => ({
      ...player,
      lastSeenAt: player.lastSeenAt ? new Date(player.lastSeenAt) : null,
      latestMatchAt: null,
    }));
  } catch {
    return null;
  }
}

function cacheDirectory(players: MainPlayer[]) {
  try {
    localStorage.setItem(
      DIRECTORY_CACHE_KEY,
      JSON.stringify({
        storedAt: Date.now(),
        players: players.map((player) => ({
          ...player,
          lastSeenAt: player.lastSeenAt?.toISOString() ?? null,
          latestMatchAt: null,
        })),
      }),
    );
  } catch {
    // Browser storage is an optional optimization.
  }
}

function socialIcon(key: string, url: string) {
  const target = `${key} ${url}`.toLowerCase();
  if (target.includes("youtube")) return Youtube;
  if (target.includes("twitch")) return Twitch;
  return LinkIcon;
}

function formatPercent(value: number | null) {
  return value == null ? "Unknown" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function playerProfileUrl(profileId: string) {
  return `https://aoe4world.com/players/${profileId}`;
}

function mergePlayer(current: MainPlayer | undefined, next: MainPlayer): MainPlayer {
  if (!current) return next;
  return {
    ...current,
    ...next,
    name: next.name !== "Unknown player" ? next.name : current.name,
    civilization: next.civilization ?? current.civilization,
    rating: next.rating ?? current.rating,
    mmr: next.mmr ?? current.mmr,
    inputType: next.inputType ?? current.inputType,
    social: { ...current.social, ...next.social },
    main: next.main.gamesCount >= current.main.gamesCount ? next.main : current.main,
    lastSeenAt: next.lastSeenAt && (!current.lastSeenAt || next.lastSeenAt > current.lastSeenAt) ? next.lastSeenAt : current.lastSeenAt,
    archivedMatches: current.archivedMatches + next.archivedMatches,
    latestMatchAt:
      next.latestMatchAt && (!current.latestMatchAt || next.latestMatchAt > current.latestMatchAt)
        ? next.latestMatchAt
        : current.latestMatchAt,
  };
}

function MainPlayerCard({ player }: { player: MainPlayer }) {
  const profileUrl = playerProfileUrl(player.profileId);
  return (
    <article className="border border-[#2b332f] bg-[#121715] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={profileUrl} target="_blank" className="block truncate text-lg font-semibold text-[#e8e3d4] transition hover:text-gold">
            {player.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8f928a]">
            {player.rating != null ? <span>Elo {player.rating}</span> : null}
            {player.mmr != null ? <span>MMR {player.mmr}</span> : null}
            {player.inputType ? <span>{player.inputType}</span> : null}
          </div>
        </div>
        <Image
          src={CIVILIZATION_FLAGS[player.main.civilization as Civilization]}
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-full border border-gold/30 object-cover"
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-sm border border-gold/35 bg-gold/[0.06] px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pick rate</div>
          <div className="mt-0.5 font-bold text-gold">{formatPercent(player.main.pickRate)}</div>
        </div>
        <div className="rounded-sm border border-[#2b332f] bg-[#0b0e0d] px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Games</div>
          <div className="mt-0.5 font-bold text-white">{player.main.gamesCount}</div>
        </div>
        <div className="rounded-sm border border-[#2b332f] bg-[#0b0e0d] px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Win rate</div>
          <div className="mt-0.5 font-bold text-white">{formatPercent(player.main.winRate)}</div>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Main civilization</dt>
          <dd className="font-semibold text-slate-200">{formatCivilization(player.main.civilization)}</dd>
        </div>
        {player.civilization ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Last seen playing</dt>
            <dd className="font-semibold text-slate-200">{formatCivilization(player.civilization)}</dd>
          </div>
        ) : null}
        {player.archivedMatches ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Saved matches</dt>
            <dd className="font-semibold text-slate-200">{player.archivedMatches}</dd>
          </div>
        ) : null}
        {player.latestMatchAt || player.lastSeenAt ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Last active</dt>
            <dd className="font-semibold text-slate-200">
              {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(player.latestMatchAt ?? player.lastSeenAt ?? new Date())}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#2b332f] pt-4">
        <Link
          href={profileUrl}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-md border border-sky-300/20 bg-sky-300/10 px-2.5 py-1.5 text-xs font-semibold text-sky-100 transition hover:border-sky-300/40"
        >
          Profile
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`${profileUrl}/games`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/20"
        >
          Games
          <Gamepad2 className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={`${profileUrl}?leaderboard=rm_solo#civilizations`}
          target="_blank"
          className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/20"
        >
          Civ stats
        </Link>
        {Object.entries(player.social).map(([key, url]) => {
          const Icon = socialIcon(key, url);
          return (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-sky-300/40 hover:text-sky-200"
              title={key.replaceAll("_", " ")}
              aria-label={`${player.name} ${key.replaceAll("_", " ")}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </a>
          );
        })}
      </div>
    </article>
  );
}

export function CivilizationMainsDirectory() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCivilization = searchParams.get("civilization");
  const initialCivilization = CIVILIZATIONS.includes(requestedCivilization as Civilization)
    ? (requestedCivilization as Civilization)
    : "japanese";
  const [selectedCivilization, setSelectedCivilization] = useState<Civilization>(initialCivilization);
  const [players, setPlayers] = useState<MainPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "pickRate" | "winRate">("rating");

  useEffect(() => {
    let active = true;

    async function loadPlayers() {
      try {
        const cachedPlayers = readCachedDirectory();
        if (cachedPlayers?.length) {
          if (active) {
            setPlayers(cachedPlayers);
            setLoading(false);
          }
          return;
        }

        const publicSnapshot = await getDoc(doc(db, "meta", "civilizationMainsSnapshot")).catch(() => null);
        const snapshotPlayers =
          publicSnapshot?.exists() && Array.isArray(publicSnapshot.data().players)
            ? (publicSnapshot.data().players as Record<string, unknown>[])
                .map((data, index) => mainPlayerFromData(data, String(index)))
                .filter((player): player is MainPlayer => Boolean(player))
            : [];
        if (snapshotPlayers.length) {
          cacheDirectory(snapshotPlayers);
          if (active) setPlayers(snapshotPlayers);
          return;
        }

        const [directorySnapshot, archiveSnapshot] = await Promise.all([
          getDocs(collection(db, "playerCivilizationMains")).catch(() => null),
          getDocs(query(collection(db, "outlierGames"), orderBy("startedAt", "desc"), limit(250))).catch(() => null),
        ]);
        if (!directorySnapshot && !archiveSnapshot) throw new Error("No civilization-main data source was available.");
        const merged = new Map<string, MainPlayer>();

        directorySnapshot?.docs.forEach((document) => {
          const data = document.data();
          const player = mainPlayerFromData(data, document.id);
          if (!player) return;
          merged.set(player.profileId, mergePlayer(merged.get(player.profileId), player));
        });

        archiveSnapshot?.docs.forEach((document) => {
          const data = document.data();
          const startedAt = dateValue(data.startedAt);
          if (!Array.isArray(data.players)) return;
          data.players.forEach((rawPlayer: Record<string, unknown>) => {
            const main = rawPlayer.civilizationMain;
            if (!main || typeof main !== "object") return;
            const mainData = main as Record<string, unknown>;
            if (
              typeof mainData.civilization !== "string" ||
              typeof mainData.pickRate !== "number" ||
              typeof mainData.gamesCount !== "number"
            )
              return;
            const profileId = String(rawPlayer.profileId ?? "");
            if (!profileId) return;
            const player: MainPlayer = {
              profileId,
              name: String(rawPlayer.name ?? "Unknown player"),
              civilization: typeof rawPlayer.civilization === "string" ? rawPlayer.civilization : null,
              rating: numberValue(rawPlayer.rating),
              mmr: numberValue(rawPlayer.mmr),
              inputType: typeof rawPlayer.inputType === "string" ? rawPlayer.inputType : null,
              social: rawPlayer.social && typeof rawPlayer.social === "object" ? (rawPlayer.social as Record<string, string>) : {},
              main: {
                civilization: mainData.civilization,
                pickRate: mainData.pickRate,
                gamesCount: mainData.gamesCount,
                winRate: numberValue(mainData.winRate),
              },
              lastSeenAt: startedAt,
              archivedMatches: 1,
              latestMatchAt: startedAt,
            };
            merged.set(profileId, mergePlayer(merged.get(profileId), player));
          });
        });

        const nextPlayers = Array.from(merged.values());
        cacheDirectory(nextPlayers);
        if (active) setPlayers(nextPlayers);
      } catch (loadError) {
        console.error(loadError);
        if (active) setError("Could not load civilization mains right now.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPlayers();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (CIVILIZATIONS.includes(requestedCivilization as Civilization)) {
      setSelectedCivilization(requestedCivilization as Civilization);
    }
  }, [requestedCivilization]);

  const filteredPlayers = useMemo(() => {
    const queryText = playerQuery.trim().toLowerCase();
    return players
      .filter((player) => player.main.civilization === selectedCivilization)
      .filter((player) => !queryText || player.name.toLowerCase().includes(queryText))
      .sort((a, b) => {
        if (sortBy === "pickRate") return b.main.pickRate - a.main.pickRate || b.main.gamesCount - a.main.gamesCount;
        if (sortBy === "winRate") return (b.main.winRate ?? 0) - (a.main.winRate ?? 0) || b.main.gamesCount - a.main.gamesCount;
        return (b.rating ?? 0) - (a.rating ?? 0) || b.main.gamesCount - a.main.gamesCount;
      });
  }, [playerQuery, players, selectedCivilization, sortBy]);

  function selectCivilization(civilization: Civilization) {
    setSelectedCivilization(civilization);
    router.replace(`/mains?civilization=${civilization}`, { scroll: false });
  }

  return (
    <div className="space-y-8">
      <section className="border border-[#2b332f] bg-[#121715] p-5">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-gold">Choose a civilization</p>
        <div className="flex flex-wrap gap-3">
          {CIVILIZATIONS.map((civilization) => {
            const selected = civilization === selectedCivilization;
            return (
              <Tooltip key={civilization} label={formatCivilization(civilization)} side="top">
                <button
                  type="button"
                  onClick={() => selectCivilization(civilization)}
                  className={cn(
                    "relative flex h-12 w-12 items-center justify-center rounded-full border transition",
                    selected
                      ? "z-10 border-[#e8e3d4] bg-gold/15 shadow-[0_0_0_3px_rgba(198,161,91,0.28)]"
                      : "border-[#2b332f] bg-[#0b0e0d] hover:border-gold",
                  )}
                  aria-label={`Show ${formatCivilization(civilization)} mains`}
                  aria-pressed={selected}
                >
                  <Image
                    src={CIVILIZATION_FLAGS[civilization]}
                    alt=""
                    width={32}
                    height={32}
                    className={cn("relative z-10 h-8 w-8 rounded-full object-cover", selected && "ring-1 ring-[#e8e3d4]")}
                  />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2">
            <Image
              src={CIVILIZATION_FLAGS[selectedCivilization]}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-full object-cover"
            />
            <h2 className="text-2xl font-semibold text-[#e8e3d4]">{formatCivilization(selectedCivilization)} specialists</h2>
          </div>
          <p className="mt-1 text-sm text-[#8f928a]">
            {loading ? "Finding players…" : `${filteredPlayers.length} ${filteredPlayers.length === 1 ? "player" : "players"} found`}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap justify-end gap-2">
          <input
            type="search"
            value={playerQuery}
            onChange={(event) => setPlayerQuery(event.target.value)}
            placeholder="Search players"
            className="h-10 min-w-[210px] rounded-sm border border-[#2b332f] bg-[#121715] px-3 text-sm text-[#e8e3d4] outline-none placeholder:text-[#686d66] focus:border-gold"
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            className="h-10 rounded-sm border border-[#2b332f] bg-[#121715] px-3 text-xs font-bold uppercase tracking-wide text-[#d0cec4] outline-none focus:border-gold"
          >
            <option value="rating">Sort: rating</option>
            <option value="pickRate">Sort: pick rate</option>
            <option value="winRate">Sort: win rate</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div>
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-72 animate-pulse rounded-lg border border-white/10 bg-white/[0.025]" />
          ))}
        </div>
      ) : filteredPlayers.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredPlayers.map((player) => (
            <MainPlayerCard key={player.profileId} player={player} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-5 py-12 text-center">
          <p className="font-semibold text-white">No {formatCivilization(selectedCivilization)} mains found yet.</p>
          <p className="mt-1 text-sm text-slate-400">The directory grows as the scanner encounters and refreshes more players.</p>
        </div>
      )}
    </div>
  );
}
