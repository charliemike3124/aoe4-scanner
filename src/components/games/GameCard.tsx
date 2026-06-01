"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, ChevronDown, ChevronUp, ExternalLink, LinkIcon, Twitch, Youtube } from "lucide-react";
import { CivilizationPill } from "@/components/games/CivilizationPill";
import { OutlierBadge } from "@/components/games/OutlierBadge";
import { ScorePill } from "@/components/games/ScorePill";
import { buttonClassName } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import type { OutlierGame } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOOKMARKS_KEY = "aoe4scanner:bookmarks";

function readBookmarks() {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

function playerGap(players: OutlierGame["players"]) {
  const mmrs = players.map((player) => player.mmr).filter((mmr): mmr is number => mmr != null);
  if (mmrs.length >= 2) return { label: "MMR diff", value: Math.abs(mmrs[0] - mmrs[1]).toString() };

  return { label: "MMR diff", value: "Unknown" };
}

function playerTitle(player: OutlierGame["players"][number]) {
  return player.name;
}

function playerStateClass(result?: string | null, spoilerLight = false) {
  if (spoilerLight) return "border-white/10 bg-slate-900/60";
  if (result?.toLowerCase() === "win") return "border-emerald-300/30 bg-emerald-400/10";
  if (result?.toLowerCase() === "loss") return "border-rose-300/25 bg-rose-400/10";
  return "border-white/10 bg-slate-900/60";
}

function formatRating(value?: number | null) {
  return value == null ? "Unrated" : value.toString();
}

function socialIcon(key: string, url: string) {
  const target = `${key} ${url}`.toLowerCase();
  if (target.includes("youtube")) return Youtube;
  if (target.includes("twitch")) return Twitch;
  return LinkIcon;
}

function socialLabel(key: string) {
  return key.replaceAll("_", " ");
}

function playerPageUrl(player?: OutlierGame["players"][number]) {
  return player?.profileId ? `https://aoe4world.com/players/${player.profileId}` : "https://aoe4world.com";
}

function playerGamesUrl(player?: OutlierGame["players"][number]) {
  return player?.profileId ? `https://aoe4world.com/players/${player.profileId}/games` : "https://aoe4world.com/games";
}

export function GameCard({
  outlier,
  compact = false,
  spoilerLight = false,
  isNew = false,
}: {
  outlier: OutlierGame;
  compact?: boolean;
  spoilerLight?: boolean;
  isNew?: boolean;
}) {
  const players = outlier.players;
  const gap = playerGap(players);
  const [bookmarked, setBookmarked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const summaryUnavailable = outlier.summaryAvailable === false;
  const aoe4worldHref = summaryUnavailable ? playerPageUrl(players[0]) : outlier.aoe4worldUrl;
  const visibleReasons = expanded ? outlier.reasons : outlier.reasons.slice(0, 3);

  useEffect(() => {
    setBookmarked(readBookmarks().has(outlier.id));
  }, [outlier.id]);

  function toggleBookmark() {
    const bookmarks = readBookmarks();
    if (bookmarks.has(outlier.id)) bookmarks.delete(outlier.id);
    else bookmarks.add(outlier.id);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(bookmarks)));
    setBookmarked(bookmarks.has(outlier.id));
    window.dispatchEvent(new Event("aoe4scanner:bookmarks-changed"));
  }

  return (
    <article className="rounded-lg border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-4 sm:flex-row">
        <ScorePill score={outlier.score} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {outlier.isFreshPick || isNew ? (
                  <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-sky-200">
                    New
                  </span>
                ) : null}
                <h2 className="flex flex-wrap items-center gap-x-1.5 text-lg font-bold text-white">
                  {players.map((player, index) => (
                    <span key={`${outlier.id}-title-${player.profileId}`} className="inline-flex items-center gap-x-1.5">
                      {index > 0 ? <span className="text-slate-500">vs</span> : null}
                      <Link href={playerGamesUrl(player)} target="_blank" className="hover:text-sky-200">
                        {playerTitle(player)}
                      </Link>
                    </span>
                  ))}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleBookmark}
                className={cn(buttonClassName("ghost"), "h-8 px-2.5", bookmarked && "text-gold")}
                aria-label={bookmarked ? "Remove bookmark" : "Bookmark game"}
              >
                <Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} />
              </button>
              <a className={cn(buttonClassName("ghost"), "h-8 px-2.5")} href={aoe4worldHref} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {summaryUnavailable ? "Player Page" : "Game Summary"}
              </a>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {players.map((participant) => (
              <div
                key={`${outlier.id}-${participant.profileId}`}
                className={cn("rounded-md border px-3 py-2", playerStateClass(participant.result, spoilerLight))}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{participant.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <CivilizationPill civilization={participant.civilization} />
                      <span className="rounded-sm border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-300">
                        Elo {formatRating(participant.rating)}
                      </span>
                      {Object.entries(participant.social ?? {}).map(([key, url]) => {
                        const Icon = socialIcon(key, url);
                        return (
                          <a
                            key={`${participant.profileId}-${key}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-sky-300/40 hover:text-sky-200"
                            aria-label={`${participant.name} ${socialLabel(key)}`}
                            title={socialLabel(key)}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                  {!spoilerLight ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        participant.result?.toLowerCase() === "win" ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200",
                      )}
                    >
                      {participant.result?.toLowerCase() === "win" ? "Winner" : "Lost"}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm text-slate-300 md:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Map</dt>
              <dd className="truncate">{outlier.map ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Duration</dt>
              <dd>{formatDuration(outlier.durationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{gap.label}</dt>
              <dd>{gap.value}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Played</dt>
              <dd>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(outlier.startedAt)}</dd>
            </div>
          </dl>

          {!compact ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {outlier.tags.map((tag) => (
                  <OutlierBadge key={tag} tag={tag} />
                ))}
              </div>
              {!spoilerLight ? (
                <div className="space-y-2">
                  <ul className="space-y-1 text-sm text-slate-300">
                    {visibleReasons.map((reason) => (
                      <li key={`${reason.type}-${reason.label}`}>{reason.label}</li>
                    ))}
                  </ul>
                  {outlier.reasons.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => setExpanded((next) => !next)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-300/10"
                    >
                      {expanded ? (
                        <>
                          Show less
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Show {outlier.reasons.length - 3} more
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Spoiler-light mode is hiding winner-specific notes.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
