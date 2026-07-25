"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Check, ChevronDown, ChevronUp, Copy, ExternalLink, LinkIcon, Play, Twitch, Youtube } from "lucide-react";
import { CivilizationPill } from "@/components/games/CivilizationPill";
import { OutlierBadge } from "@/components/games/OutlierBadge";
import { ScorePill } from "@/components/games/ScorePill";
import { buttonClassName } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { formatCivilization, formatDuration } from "@/lib/format";
import type { OutlierGame } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOOKMARKS_KEY = "aoe4scanner:bookmarks";
const COLLAPSED_PLAYER_REASON_COUNT = 3;

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
  if (spoilerLight) return "border-[#2b332f] bg-[#171c19]";
  if (result?.toLowerCase() === "win") return "border-[#285644] bg-[#10201a]";
  if (result?.toLowerCase() === "loss") return "border-[#563039] bg-[#211517]";
  return "border-[#2b332f] bg-[#171c19]";
}

function formatRating(value?: number | null) {
  return value == null ? "Unrated" : value.toString();
}

function formatPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
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

async function writeToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    textArea.remove();
    return copied;
  }
}

function reasonDisplayPriority(reason: OutlierGame["reasons"][number]) {
  if (reason.type.startsWith("summary_") || reason.type.startsWith("strategy_")) return 3;
  if (reason.type.includes("upset") || reason.label.toLowerCase().includes("underdog")) return 2;
  return 1;
}

function reasonPlayer(reason: OutlierGame["reasons"][number], players: OutlierGame["players"]) {
  if (reason.playerProfileId) {
    const exactPlayer = players.find((player) => player.profileId === reason.playerProfileId);
    if (exactPlayer) return exactPlayer;
  }

  const typedPlayer = players.find((player) => reason.type.includes(player.profileId));
  if (typedPlayer) return typedPlayer;

  const label = reason.label.toLowerCase();
  const namedPlayer = players.find((player) => label.includes(player.name.toLowerCase()));
  if (namedPlayer) return namedPlayer;

  if (reason.type.includes("loser") || reason.type.includes("enemy_bled")) {
    return players.find((player) => player.result?.toLowerCase() === "loss");
  }
  if (reason.type.startsWith("summary_") && reason.type !== "summary_rare_win_condition") {
    return players.find((player) => player.result?.toLowerCase() === "win");
  }
  return undefined;
}

function readableReasonLabel(reason: OutlierGame["reasons"][number], player?: OutlierGame["players"][number]) {
  let label = reason.label.replace(/^Game summary:\s*/i, "").trim();
  if (player) {
    const escapedName = player.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    label = label.replace(new RegExp(`^${escapedName}(?:\\s+\\([^)]*\\))?\\s*`, "i"), "");
    label = label.replace(/^'s\s+/i, "");
  }
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : reason.label;
}

function TagRow({ tags }: { tags: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const moreRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observedContainer = container;

    function measure() {
      const availableWidth = observedContainer.clientWidth;
      const tagWidths = tags.map((_, index) => tagRefs.current[index]?.getBoundingClientRect().width ?? 0);
      const gap = 8;
      const allTagsWidth = tagWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, tags.length - 1) * gap;

      if (allTagsWidth <= availableWidth) {
        setVisibleCount(tags.length);
        return;
      }

      const moreWidth = moreRef.current?.getBoundingClientRect().width ?? 0;
      let usedWidth = 0;
      let nextVisibleCount = 0;
      for (const width of tagWidths) {
        const widthWithTag = usedWidth + (nextVisibleCount ? gap : 0) + width;
        const widthWithOverflow = widthWithTag + gap + moreWidth;
        if (widthWithOverflow > availableWidth) break;
        usedWidth = widthWithTag;
        nextVisibleCount += 1;
      }
      setVisibleCount(nextVisibleCount);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(observedContainer);
    return () => observer.disconnect();
  }, [tags]);

  const hiddenTags = tags.slice(visibleCount);

  return (
    <div ref={containerRef} className="relative min-w-0">
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        {tags.slice(0, visibleCount).map((tag) => (
          <span key={tag} className="shrink-0">
            <OutlierBadge tag={tag} />
          </span>
        ))}
        {hiddenTags.length ? (
          <span className="shrink-0">
            <Tooltip label={hiddenTags.join(" · ")} side="top" align="start">
              <span className="inline-flex cursor-help rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100">
                {hiddenTags.length} more
              </span>
            </Tooltip>
          </span>
        ) : null}
      </div>

      <div aria-hidden className="pointer-events-none fixed left-[-10000px] top-[-10000px] flex gap-2 opacity-0">
        {tags.map((tag, index) => (
          <span
            key={tag}
            ref={(element) => {
              tagRefs.current[index] = element;
            }}
            className="shrink-0"
          >
            <OutlierBadge tag={tag} />
          </span>
        ))}
        <span
          ref={moreRef}
          className="inline-flex shrink-0 rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-medium text-sky-100"
        >
          {tags.length} more
        </span>
      </div>
    </div>
  );
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
  const [copiedProfileId, setCopiedProfileId] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryUnavailable = outlier.summaryAvailable === false;
  const aoe4worldHref = summaryUnavailable ? playerPageUrl(players[0]) : outlier.summaryUrl ?? outlier.aoe4worldUrl;
  const displayReasons = [...outlier.reasons].sort(
    (a, b) => reasonDisplayPriority(b) - reasonDisplayPriority(a) || b.weight - a.weight,
  );
  const winner = players.find((player) => player.result?.toLowerCase() === "win");
  const loser = players.find((player) => player.result?.toLowerCase() === "loss");
  const allWinnerReasons = displayReasons.filter((reason) => reasonPlayer(reason, players)?.profileId === winner?.profileId);
  const allLoserReasons = displayReasons.filter((reason) => reasonPlayer(reason, players)?.profileId === loser?.profileId);
  const allMatchReasons = displayReasons.filter((reason) => !reasonPlayer(reason, players));
  const winnerReasons = expanded ? allWinnerReasons : allWinnerReasons.slice(0, COLLAPSED_PLAYER_REASON_COUNT);
  const loserReasons = expanded ? allLoserReasons : allLoserReasons.slice(0, COLLAPSED_PLAYER_REASON_COUNT);
  const matchReasons = expanded ? allMatchReasons : [];
  const visibleReasonCount = winnerReasons.length + loserReasons.length + matchReasons.length;
  const hiddenReasonCount = displayReasons.length - visibleReasonCount;

  useEffect(() => {
    setBookmarked(readBookmarks().has(outlier.id));
  }, [outlier.id]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  function toggleBookmark() {
    const bookmarks = readBookmarks();
    if (bookmarks.has(outlier.id)) bookmarks.delete(outlier.id);
    else bookmarks.add(outlier.id);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(Array.from(bookmarks)));
    setBookmarked(bookmarks.has(outlier.id));
    window.dispatchEvent(new Event("aoe4scanner:bookmarks-changed"));
  }

  async function copyPlayerName(player: OutlierGame["players"][number]) {
    const copied = await writeToClipboard(player.name);
    if (!copied) return;
    setCopiedProfileId(player.profileId);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedProfileId(null), 1800);
  }

  return (
    <article className="border border-[#2b332f] bg-[#121715] p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        <ScorePill score={outlier.score} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2b332f] pb-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {outlier.isFreshPick || isNew ? (
                  <span className="rounded-full border border-gold/35 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gold">
                    New
                  </span>
                ) : null}
                <h2 className="flex flex-wrap items-center gap-x-1.5 text-lg font-semibold text-[#e8e3d4]">
                  {players.map((player, index) => (
                    <span key={`${outlier.id}-title-${player.profileId}`} className="inline-flex items-center gap-x-1.5">
                      {index > 0 ? <span className="font-normal text-[#6f746d]">vs</span> : null}
                      <Link href={index === 0 ? playerGamesUrl(player) : playerPageUrl(player)} target="_blank" className="hover:text-gold">
                        {playerTitle(player)}
                      </Link>
                    </span>
                  ))}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {outlier.replayAvailable ? (
                <a
                  className={cn(buttonClassName("secondary"), "h-8 px-2.5 text-gold")}
                  href={outlier.replayUrl ?? `https://aoe4replays.gg/games/${outlier.aoe4worldGameId}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open this game on AOE4Replays"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Watch Replay
                </a>
              ) : null}
              <button
                type="button"
                onClick={toggleBookmark}
                className={cn(buttonClassName("ghost"), "h-8 px-2.5", bookmarked && "text-gold")}
                aria-label={bookmarked ? "Remove bookmark" : "Bookmark game"}
              >
                <Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} />
              </button>
              <Tooltip
                side="bottom"
                align="end"
                label={
                  summaryUnavailable
                    ? "AOE4World does not have a public summary for this match, so this opens the player page instead."
                    : "Opens the AOE4World game summary. Sometimes summaries are unavailable on AOE4World."
                }
              >
                <a className={cn(buttonClassName("ghost"), "h-8 px-2.5")} href={aoe4worldHref} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {summaryUnavailable ? "Player Page" : "Game Summary"}
                </a>
              </Tooltip>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {players.map((participant) => (
              <div
                key={`${outlier.id}-${participant.profileId}`}
                className={cn("group/player rounded-sm border px-3 py-2", playerStateClass(participant.result, spoilerLight))}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Link
                        href={playerPageUrl(participant)}
                        target="_blank"
                        className="min-w-0 truncate text-sm font-semibold text-[#e8e3d4] transition hover:text-gold"
                      >
                        {participant.name}
                      </Link>
                      <Tooltip
                        side="top"
                        align="start"
                        label={copiedProfileId === participant.profileId ? "Player name copied" : "Copy player name"}
                      >
                        <button
                          type="button"
                          onClick={() => copyPlayerName(participant)}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[#777b74] opacity-70 transition hover:text-gold hover:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-gold"
                          aria-label={`Copy ${participant.name}`}
                        >
                          {copiedProfileId === participant.profileId ? (
                            <Check className="h-3.5 w-3.5 text-[#9bd4b2]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </Tooltip>
                    </div>
                    <div className="mt-1 flex flex-col items-start gap-1.5">
                      <div>
                        <CivilizationPill civilization={participant.civilization} />
                      </div>
                      {participant.civilizationMain ? (
                        <a
                          href={`${playerPageUrl(participant)}?leaderboard=rm_solo#civilizations`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-sm border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold transition hover:border-gold/50 hover:bg-gold/15"
                          title={`${formatCivilization(participant.civilizationMain.civilization)} main: ${formatPercent(participant.civilizationMain.pickRate)} pick rate across ${participant.civilizationMain.gamesCount} games`}
                        >
                          {formatCivilization(participant.civilizationMain.civilization)} main · {formatPercent(participant.civilizationMain.pickRate)} · {participant.civilizationMain.gamesCount}g
                        </a>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
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
                  </div>
                  {!spoilerLight ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]",
                        participant.result?.toLowerCase() === "win" ? "bg-[#285644]/50 text-[#9bd4b2]" : "bg-[#563039]/50 text-[#e6a397]",
                      )}
                    >
                      {participant.result?.toLowerCase() === "win" ? "Winner" : "Lost"}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm text-[#d0cec4] md:grid-cols-4">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#777b74]">Map</dt>
              <dd className="truncate">{outlier.map ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#777b74]">Duration</dt>
              <dd>{formatDuration(outlier.durationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#777b74]">{gap.label}</dt>
              <dd>{gap.value}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#777b74]">Played</dt>
              <dd>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(outlier.startedAt)}</dd>
            </div>
          </dl>

          <div className="space-y-3">
            <TagRow tags={outlier.tags} />
            {compact && !expanded ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className={cn(buttonClassName("secondary"), "h-9")}
              >
                Show full details
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            ) : !spoilerLight ? (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    {players.map((player) => {
                      const isWinner = player.result?.toLowerCase() === "win";
                      const column = {
                        title: isWinner ? "Winner" : "Loser",
                        player,
                        reasons: isWinner ? winnerReasons : loserReasons,
                        tone: isWinner ? "border-[#285644] bg-[#10201a]" : "border-[#563039] bg-[#211517]",
                        heading: isWinner ? "text-[#9bd4b2]" : "text-[#e6a397]",
                      };
                      return (
                        <section key={column.player.profileId} className={cn("rounded-md border p-3", column.tone)}>
                          <h3 className={cn("text-xs font-bold uppercase tracking-wide", column.heading)}>
                            {column.title}
                            <span className="ml-1.5 normal-case tracking-normal text-slate-400">· {column.player.name}</span>
                          </h3>
                          {column.reasons.length ? (
                            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-300">
                              {column.reasons.map((reason) => (
                                <li key={`${reason.type}-${reason.label}`} className="flex gap-2">
                                  <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                                  <span>{readableReasonLabel(reason, column.player)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-slate-500">No standout details found.</p>
                          )}
                        </section>
                      );
                    })}
                  </div>
                  {matchReasons.length ? (
                    <section className="rounded-md border border-white/10 bg-white/[0.025] px-3 py-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Match context</h3>
                      <ul className="mt-1.5 grid gap-x-5 gap-y-1 text-sm text-slate-300 md:grid-cols-2">
                        {matchReasons.map((reason) => (
                          <li key={`${reason.type}-${reason.label}`} className="flex gap-2">
                            <span className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                            <span>{readableReasonLabel(reason)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                    {expanded || hiddenReasonCount > 0 || compact ? (
                    <button
                      type="button"
                      onClick={() => setExpanded((next) => !next)}
                      className={cn(buttonClassName("secondary"), "h-9")}
                    >
                      {expanded ? (
                        <>
                          {compact ? "Hide full details" : "Show less"}
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Show {hiddenReasonCount} more
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
            ) : (
              <p className="text-sm text-[#9ea097]">Spoiler-light mode is hiding winner-specific notes.</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
