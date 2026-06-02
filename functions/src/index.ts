import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

initializeApp();

const db = getFirestore();
const API_BASE = "https://aoe4world.com/api/v0";
const USER_AGENT = process.env.AOE4WORLD_USER_AGENT ?? "AOE4Scanner/0.1 contact: configure_AOE4WORLD_USER_AGENT";
const TRACKED_PLAYERS_DOC = db.collection("meta").doc("trackedPlayers");
const SCAN_STATE_DOC = db.collection("meta").doc("scanState");
const SCAN_LOCK_DOC = db.collection("meta").doc("scanLock");
const PUBLIC_STATUS_DOC = db.collection("meta").doc("publicStatus");
const HOMEPAGE_HIGHLIGHTS_DOC = db.collection("meta").doc("homepageHighlights");
const ARCHIVE_SNAPSHOT_DOC = db.collection("meta").doc("archiveSnapshot");
const OUTLIER_COLLECTION = db.collection("outlierGames");
const IGNORED_COLLECTION = db.collection("ignoredGames");
const MIN_RATING = 1700;
const MAX_LEADERBOARD_PAGES = 12;
const BATCH_SIZE = 50;
const REQUEST_DELAY_MS = 4000;
const MAX_GAME_PAGES_PER_BATCH = 1;
const MAX_GAME_REQUESTS_PER_SCAN = 4;
const ADAPTIVE_MAX_GAME_REQUESTS_PER_SCAN = 8;
const MIN_FRESH_GAMES_BEFORE_STOPPING = 40;
const MAX_GAMES_PER_SCAN = 100;
const GAMES_TO_SAVE_PER_SCAN = 5;
const SUMMARY_FINALIST_COUNT = 5;
const ELITE_SUMMARY_PROBE_COUNT = 3;
const FRESH_PICK_SCAN_WINDOW = 3;
const MIN_GAME_DURATION_SECONDS = 8 * 60;
const MIN_SCORE = 32;
const ELITE_MMR = 2000;
const CANDIDATE_LOOKBACK_HOURS = 12;
const IGNORED_GAME_TTL_HOURS = 24;
const PRIMARY_LOOKBACK_HOURS = 6;
const ARCHIVE_SNAPSHOT_LIMIT = 200;

type AnyRecord = Record<string, unknown>;

type AoePlayer = {
  profileId: string;
  name: string;
  civilization: string | null;
  rating: number | null;
  mmr: number | null;
  ratingDiff: number | null;
  mmrDiff: number | null;
  result: string | null;
  team: number;
  inputType: string | null;
  social: Record<string, string>;
};

type AoeGame = {
  aoe4worldGameId: string;
  aoe4worldUrl: string;
  startedAt: Date;
  updatedAt: Date | null;
  mapId: number | null;
  map: string | null;
  durationSeconds: number | null;
  patch: string | null;
  season: string | null;
  averageRating: number | null;
  averageMmr: number | null;
  civilizations: string[];
  players: AoePlayer[];
};

type CivStat = {
  civilization: string;
  winRate: number;
  pickRate: number;
};

type MatchupStat = {
  civilization: string;
  otherCivilization: string;
  winRate: number;
  gamesCount: number;
};

type Reason = {
  type: string;
  label: string;
  weight: number;
};

type ScoredCandidate = { game: AoeGame; summaryAvailable?: boolean; summaryUrl?: string | null } & ReturnType<typeof scoreGame>;
type StoredOutlierGame = AoeGame & {
  id: string;
  selectedAt: Date;
  expiresAt: Date;
  score: number;
  summaryAvailable: boolean | null;
  summaryUrl: string | null;
  reasons: Reason[];
  tags: string[];
  matchupStats: ScoredCandidate["matchupStats"] | null;
  isFreshPick?: boolean;
};

type FetchDiagnostics = {
  apiRequestsMade: number;
  rawGamesFetched: number;
  skippedAlreadyExcluded: number;
  skippedLowRating: number;
  skippedInvalid: number;
  eligibleGamesCollected: number;
  freshGamesCollected: number;
  startPlayerOffset: number;
  nextPlayerOffset: number;
  playerBatchesChecked: number;
};

const SCALING_CIVS = new Set(["abbasid_dynasty", "chinese", "byzantines", "zhu_xis_legacy", "jin_dynasty"]);
const TEMPO_CIVS = new Set(["french", "mongols", "english", "jeanne_darc", "ottomans"]);
const mapCivStatCache = new Map<string, CivStat | null>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function record(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function intValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.round(Number(value));
  }
  return null;
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function dateValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}

function socialLinks(value: unknown) {
  const social = record(value);
  const links: Record<string, string> = {};
  for (const [key, raw] of Object.entries(social)) {
    if (typeof raw === "string" && /^https?:\/\//i.test(raw)) links[key] = raw;
  }
  return links;
}

async function fetchJson<T>(url: URL, retries = 2): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (response.ok) return (await response.json()) as T;

    const body = await response.text().catch(() => "");
    lastError = new Error(`AOE4World ${response.status}: ${body.slice(0, 160)}`);
    if (response.status === 429) break;
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 2500 * 2 ** attempt);
      continue;
    }
    break;
  }
  throw lastError ?? new Error("AOE4World request failed");
}

function normalizeGame(raw: unknown): AoeGame | null {
  const game = record(raw);
  const id = stringValue(game.game_id, game.id, game.match_id);
  if (!id) return null;

  const teamArrays = arrayValue(game.teams);
  const players = teamArrays.flatMap((team, teamIndex) =>
    arrayValue(team).map((entry) => {
      const player = record(record(entry).player ?? entry);
      return {
        profileId: stringValue(player.profile_id, player.profileId, player.id) ?? crypto.randomUUID(),
        name: stringValue(player.name, player.username) ?? "Unknown player",
        civilization: stringValue(player.civilization, player.civ),
        rating: intValue(player.rating, player.elo),
        mmr: intValue(player.mmr),
        ratingDiff: intValue(player.rating_diff, player.ratingDiff),
        mmrDiff: intValue(player.mmr_diff, player.mmrDiff),
        result: stringValue(player.result),
        team: teamIndex + 1,
        inputType: stringValue(player.input_type, player.inputType),
        social: socialLinks(player.social),
      };
    }),
  );
  if (players.length !== 2) return null;
  if (!players.some((player) => player.result === "win") || !players.some((player) => player.result === "loss")) return null;
  if (game.ongoing === true || !game.duration) return null;
  const durationSeconds = intValue(game.duration, game.duration_seconds, game.durationSeconds);
  if (durationSeconds != null && durationSeconds < MIN_GAME_DURATION_SECONDS) return null;

  const ratings = players.map((player) => player.rating).filter((rating): rating is number => rating != null);
  const mmrs = players.map((player) => player.mmr).filter((mmr): mmr is number => mmr != null);

  return {
    aoe4worldGameId: id,
    aoe4worldUrl: `https://aoe4world.com/players/${players[0].profileId}/games/${id}`,
    startedAt: dateValue(game.started_at, game.startedAt) ?? new Date(),
    updatedAt: dateValue(game.updated_at, game.updatedAt),
    mapId: intValue(game.map_id, game.mapId),
    map: stringValue(game.map, game.map_name),
    durationSeconds,
    patch: stringValue(game.patch, game.patch_version),
    season: stringValue(game.season),
    averageRating:
      intValue(game.average_rating, game.averageRating) ??
      (ratings.length ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) : null),
    averageMmr:
      intValue(game.average_mmr, game.averageMmr) ??
      (mmrs.length ? Math.round(mmrs.reduce((sum, mmr) => sum + mmr, 0) / mmrs.length) : null),
    civilizations: players.map((player) => player.civilization).filter((civ): civ is string => Boolean(civ)),
    players,
  };
}

function addReason(reasons: Reason[], tags: Set<string>, type: string, label: string, weight: number, tag: string) {
  reasons.push({ type, label, weight });
  tags.add(tag);
}

function gamePlayerIds(game: AoeGame) {
  return game.players.map((player) => player.profileId).filter(Boolean);
}

function minimumPlayerMmr(game: AoeGame) {
  const mmrs = game.players.map((player) => player.mmr).filter((mmr): mmr is number => mmr != null);
  return mmrs.length >= 2 ? Math.min(...mmrs) : null;
}

function isMirrorMatch(game: AoeGame) {
  const civs = game.players.map((player) => player.civilization).filter(Boolean);
  return civs.length === 2 && civs[0] === civs[1];
}

function isEliteGame(game: AoeGame, minimumMmr = ELITE_MMR) {
  const mmrs = game.players.map((player) => player.mmr);
  return mmrs.length >= 2 && mmrs.every((mmr) => mmr != null && mmr >= minimumMmr);
}

function eliteBaselineWeight(game: AoeGame) {
  const minimumMmr = minimumPlayerMmr(game);
  if (minimumMmr == null) return 0;
  if (minimumMmr >= 2200) return 48;
  if (minimumMmr >= 2100) return 40;
  if (minimumMmr >= 2000) return MIN_SCORE;
  return 0;
}

function scoreGame(game: AoeGame, civStats: Map<string, CivStat>) {
  const reasons: Reason[] = [];
  const tags = new Set<string>();
  const winner = game.players.find((player) => player.result === "win");
  const loser = game.players.find((player) => player.result === "loss");

  if (isMirrorMatch(game)) {
    return { score: 0, reasons, tags: [] };
  }

  if (winner && loser) {
    const winnerMmr = winner.mmr;
    const loserMmr = loser.mmr;
    if (!isEliteGame(game) && winnerMmr != null && loserMmr != null && winnerMmr - loserMmr >= 150) {
      return { score: 0, reasons, tags: [] };
    }
  }

  let matchupStats: {
    winnerCivilization: string | null;
    loserCivilization: string | null;
    winnerPickRate: number | null;
    winnerWinRate: number | null;
    loserWinRate: number | null;
  } | null = null;

  if (winner && loser) {
    const winnerStat = winner.civilization ? civStats.get(winner.civilization) : undefined;
    const loserStat = loser.civilization ? civStats.get(loser.civilization) : undefined;
    const eliteWeight = eliteBaselineWeight(game);
    matchupStats = {
      winnerCivilization: winner.civilization,
      loserCivilization: loser.civilization,
      winnerPickRate: winnerStat?.pickRate ?? null,
      winnerWinRate: winnerStat?.winRate ?? null,
      loserWinRate: loserStat?.winRate ?? null,
    };

    if (eliteWeight) {
      addReason(reasons, tags, "elite_match", `Elite match with both players at ${minimumPlayerMmr(game)}+ MMR`, eliteWeight, "Elite match");
    }
    if (winner.mmr != null && loser.mmr != null && winner.mmr < loser.mmr) {
      const diff = loser.mmr - winner.mmr;
      if (diff >= 400) addReason(reasons, tags, "insane_mmr_upset", `Underdog winner was down ${diff} MMR`, 62, "Insane upset");
      else if (diff >= 250) addReason(reasons, tags, "strong_mmr_upset", `Underdog winner was down ${diff} MMR`, 46, "Strong upset");
      else if (diff >= 150) addReason(reasons, tags, "mmr_upset", `Underdog winner was down ${diff} MMR`, 34, "MMR upset");
    }
    if (loser.mmr != null && loser.mmr >= 2150 && winner.mmr != null && winner.mmr < loser.mmr) {
      addReason(reasons, tags, "elite_opponent", `Winner beat an elite opponent (${loser.name})`, 14, "Elite opponent");
    }
    if (winnerStat) {
      if (winnerStat.winRate < 46) {
        addReason(reasons, tags, "very_low_winrate_civ_win", `${winner.civilization} has ${winnerStat.winRate.toFixed(1)}% overall win rate`, 24, "Low win-rate civ");
      } else if (winnerStat.winRate < 48) {
        addReason(reasons, tags, "low_winrate_civ_win", `${winner.civilization} has ${winnerStat.winRate.toFixed(1)}% overall win rate`, 16, "Low win-rate civ");
      }
      if (eliteWeight && winnerStat.winRate < 48) {
        addReason(reasons, tags, "elite_low_winrate_civ_bonus", `Elite win with a ${winnerStat.winRate.toFixed(1)}% overall win-rate civilization`, 8, "Elite civ angle");
      }
    }
  }

  if (winner?.civilization && game.durationSeconds != null && SCALING_CIVS.has(winner.civilization) && game.durationSeconds <= 12 * 60) {
    addReason(reasons, tags, "short_scaling_civ_win", `${winner.civilization} won in ${Math.round(game.durationSeconds / 60)} minutes`, 18, "Fast scaling win");
  }
  if (winner?.civilization && game.durationSeconds != null && TEMPO_CIVS.has(winner.civilization) && game.durationSeconds >= 45 * 60) {
    addReason(reasons, tags, "long_tempo_civ_win", `${winner.civilization} won a ${Math.round(game.durationSeconds / 60)} minute game`, 18, "Late tempo win");
  }
  if (game.durationSeconds != null && game.durationSeconds <= 11 * 60 && reasons.some((reason) => reason.type.includes("upset"))) {
    addReason(reasons, tags, "fast_upset", "Upset finished in under 11 minutes", 12, "Fast upset");
  }

  return {
    score: reasons.reduce((sum, reason) => sum + reason.weight, 0),
    reasons,
    tags: Array.from(tags),
    matchupStats,
  };
}

function scoreCandidates(games: AoeGame[], civStats: Map<string, CivStat>) {
  return games
    .map((game) => ({ game, ...scoreGame(game, civStats) }))
    .filter((candidate) => candidate.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.game.startedAt.getTime() - a.game.startedAt.getTime());
}

function eliteSummaryProbeCandidates(games: AoeGame[], civStats: Map<string, CivStat>, scored: ScoredCandidate[]) {
  const scoredIds = new Set(scored.map((candidate) => candidate.game.aoe4worldGameId));
  return games
    .map((game) => ({ game, ...scoreGame(game, civStats) }))
    .filter((candidate) => {
      if (scoredIds.has(candidate.game.aoe4worldGameId)) return false;
      if (!isEliteGame(candidate.game)) return false;
      if (isMirrorMatch(candidate.game)) return false;
      const duration = candidate.game.durationSeconds ?? 0;
      return duration >= 18 * 60 || duration <= 12 * 60 || duration >= 45 * 60;
    })
    .sort((a, b) => {
      const mmrDiff = (b.game.averageMmr ?? 0) - (a.game.averageMmr ?? 0);
      if (mmrDiff) return mmrDiff;
      return b.game.startedAt.getTime() - a.game.startedAt.getTime();
    })
    .slice(0, ELITE_SUMMARY_PROBE_COUNT);
}

function mergeCandidates(candidates: ScoredCandidate[]) {
  const byGameId = new Map<string, ScoredCandidate>();
  for (const candidate of candidates) {
    const existing = byGameId.get(candidate.game.aoe4worldGameId);
    if (!existing || candidate.score > existing.score) byGameId.set(candidate.game.aoe4worldGameId, candidate);
  }
  return Array.from(byGameId.values()).sort((a, b) => b.score - a.score || b.game.startedAt.getTime() - a.game.startedAt.getTime());
}

function selectDiverseCandidates(candidates: ScoredCandidate[], count: number) {
  const selected: ScoredCandidate[] = [];
  const usedPlayerIds = new Set<string>();
  const selectedGameIds = new Set<string>();

  for (const candidate of candidates) {
    const playerIds = gamePlayerIds(candidate.game);
    if (playerIds.some((profileId) => usedPlayerIds.has(profileId))) continue;
    selected.push(candidate);
    selectedGameIds.add(candidate.game.aoe4worldGameId);
    playerIds.forEach((profileId) => usedPlayerIds.add(profileId));
    if (selected.length >= count) return selected;
  }

  for (const candidate of candidates) {
    if (selectedGameIds.has(candidate.game.aoe4worldGameId)) continue;
    selected.push(candidate);
    selectedGameIds.add(candidate.game.aoe4worldGameId);
    if (selected.length >= count) break;
  }

  return selected;
}

const COMEBACK_REASON_PATTERNS = [
  "comeback",
  "villager_deficit",
  "resource_deficit",
  "lost_multiple_landmarks",
  "won_after_losing_tc",
  "lost_tc",
];

function storedWinnerAndLoser(game: Pick<StoredOutlierGame, "players">) {
  return {
    winner: game.players.find((player) => player.result?.toLowerCase() === "win"),
    loser: game.players.find((player) => player.result?.toLowerCase() === "loss"),
  };
}

function storedUnderdogMmrDiff(game: Pick<StoredOutlierGame, "players">) {
  const { winner, loser } = storedWinnerAndLoser(game);
  if (winner?.mmr == null || loser?.mmr == null || winner.mmr >= loser.mmr) return 0;
  return loser.mmr - winner.mmr;
}

function isStoredEliteGame(game: Pick<StoredOutlierGame, "players">) {
  const mmrs = game.players.map((player) => player.mmr);
  return mmrs.length >= 2 && mmrs.every((mmr) => mmr != null && mmr >= ELITE_MMR);
}

function hasStoredComebackSignal(game: Pick<StoredOutlierGame, "reasons">) {
  return game.reasons.some((reason) => {
    const haystack = `${reason.type} ${reason.label}`.toLowerCase();
    return COMEBACK_REASON_PATTERNS.some((pattern) => haystack.includes(pattern));
  });
}

function bestStoredBy(games: StoredOutlierGame[], score: (game: StoredOutlierGame) => number) {
  return (
    [...games].sort((a, b) => score(b) - score(a) || b.score - a.score || b.selectedAt.getTime() - a.selectedAt.getTime())[0] ?? null
  );
}

function serializeStoredOutlierGame(game: StoredOutlierGame) {
  return {
    ...game,
    startedAt: Timestamp.fromDate(game.startedAt),
    updatedAt: game.updatedAt ? Timestamp.fromDate(game.updatedAt) : null,
    selectedAt: Timestamp.fromDate(game.selectedAt),
    expiresAt: Timestamp.fromDate(game.expiresAt),
  };
}

function selectHomepageHighlights(games: StoredOutlierGame[]) {
  const selectedIds = new Set<string>();
  const highlights: Array<{ label: string; game: ReturnType<typeof serializeStoredOutlierGame> }> = [];

  function add(label: string, game: StoredOutlierGame | null) {
    if (!game || selectedIds.has(game.id)) return;
    selectedIds.add(game.id);
    highlights.push({ label, game: serializeStoredOutlierGame(game) });
  }

  add("Highest Score", bestStoredBy(games.filter((game) => game.score >= 100), (game) => game.score));
  add("Best Comeback", bestStoredBy(games.filter((game) => !selectedIds.has(game.id) && hasStoredComebackSignal(game)), (game) => game.score));
  add("Best Pro Match", bestStoredBy(games.filter((game) => !selectedIds.has(game.id) && isStoredEliteGame(game)), (game) => game.score));
  add("Biggest Upset", bestStoredBy(games.filter((game) => !selectedIds.has(game.id) && storedUnderdogMmrDiff(game) >= 150), storedUnderdogMmrDiff));

  return highlights;
}

async function findUnsavedCandidates<T extends { game: AoeGame }>(candidates: T[], count: number) {
  const unsaved: T[] = [];
  for (const candidate of candidates) {
    const existing = await OUTLIER_COLLECTION.doc(candidate.game.aoe4worldGameId).get();
    if (!existing.exists) unsaved.push(candidate);
    if (unsaved.length >= count) break;
  }
  return unsaved;
}

async function loadExcludedGameIds() {
  const [savedSnapshot, ignoredSnapshot] = await Promise.all([
    OUTLIER_COLLECTION.where("expiresAt", ">=", Timestamp.fromDate(new Date())).select().limit(500).get(),
    IGNORED_COLLECTION.where("expiresAt", ">=", Timestamp.fromDate(new Date())).select().limit(1000).get(),
  ]);
  return new Set([...savedSnapshot.docs.map((doc) => doc.id), ...ignoredSnapshot.docs.map((doc) => doc.id)]);
}

async function rememberRejectedGames(games: AoeGame[], scored: ScoredCandidate[]) {
  const scoredIds = new Set(scored.map((candidate) => candidate.game.aoe4worldGameId));
  const rejected = games.filter((game) => !scoredIds.has(game.aoe4worldGameId));
  if (!rejected.length) return 0;

  const batch = db.batch();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + IGNORED_GAME_TTL_HOURS * 60 * 60 * 1000));
  rejected.slice(0, 100).forEach((game) => {
    batch.set(
      IGNORED_COLLECTION.doc(game.aoe4worldGameId),
      {
        reason: "below_current_outlier_score",
        startedAt: Timestamp.fromDate(game.startedAt),
        expiresAt,
      },
      { merge: true },
    );
  });
  await batch.commit();
  return rejected.length;
}

async function markFreshPicks(selectedIds: string[]) {
  const recentFreshIds = new Set(selectedIds);
  const recentRuns = await db
    .collection("scanRuns")
    .orderBy("startedAt", "desc")
    .limit(Math.max(0, FRESH_PICK_SCAN_WINDOW - 1))
    .get();
  recentRuns.docs.forEach((doc) => {
    const runSelectedIds = doc.data().selectedGameIds;
    if (Array.isArray(runSelectedIds)) {
      runSelectedIds.forEach((gameId) => {
        if (typeof gameId === "string") recentFreshIds.add(gameId);
      });
    }
  });
  const previousFresh = await OUTLIER_COLLECTION.where("isFreshPick", "==", true).limit(50).get();
  if (previousFresh.empty && !recentFreshIds.size) return;
  const batch = db.batch();
  previousFresh.docs.forEach((doc) => batch.set(doc.ref, { isFreshPick: false }, { merge: true }));
  recentFreshIds.forEach((id) => batch.set(OUTLIER_COLLECTION.doc(id), { isFreshPick: true }, { merge: true }));
  await batch.commit();
}

function addSummaryReason(candidate: ScoredCandidate, type: string, label: string, weight: number, tag: string) {
  candidate.reasons.push({ type, label, weight });
  candidate.tags = Array.from(new Set([...candidate.tags, tag]));
  candidate.score += weight;
}

function actionTime(player: AnyRecord, actionName: string) {
  const actions = record(player.actions);
  const action = actions[actionName];
  if (!Array.isArray(action)) return null;
  const first = action[0];
  return typeof first === "number" && Number.isFinite(first) ? first : null;
}

function resourceTotal(value: unknown) {
  const resources = record(value);
  return ["food", "gold", "stone", "wood"].reduce((sum, key) => sum + (numberValue(resources[key]) ?? 0), 0);
}

function numberArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function valueAt(values: number[], index: number) {
  return typeof values[index] === "number" ? values[index] : null;
}

function villagerCountAt(player: AnyRecord, timestamp: number) {
  const villagerEntries = arrayValue(player.buildOrder).map(record).filter((entry) => {
    const icon = stringValue(entry.icon) ?? "";
    return stringValue(entry.type) === "Unit" && icon.includes("villager");
  });
  if (!villagerEntries.length) return null;
  const created = villagerEntries.reduce((sum, entry) => sum + numberArray(entry.finished).filter((time) => time <= timestamp).length, 0);
  const lost = villagerEntries.reduce((sum, entry) => sum + numberArray(entry.destroyed).filter((time) => time <= timestamp).length, 0);
  const count = created - lost;
  return count >= 0 && count <= 250 ? count : null;
}

function firstMilitaryProductionTime(player: AnyRecord) {
  const ignored = ["scout", "villager", "monk", "khan"];
  let first: number | null = null;
  for (const raw of arrayValue(player.buildOrder)) {
    const entry = record(raw);
    if (stringValue(entry.type) !== "Unit") continue;
    const icon = stringValue(entry.icon) ?? "";
    if (ignored.some((name) => icon.includes(name))) continue;
    for (const time of numberArray(entry.finished)) {
      if (time > 0 && (first == null || time < first)) first = time;
    }
  }
  return first;
}

function countDestroyedBuildings(player: AnyRecord, patterns: string[]) {
  let count = 0;
  for (const raw of arrayValue(player.buildOrder)) {
    const entry = record(raw);
    if (stringValue(entry.type) !== "Building") continue;
    const icon = stringValue(entry.icon) ?? "";
    if (!patterns.some((pattern) => icon.includes(pattern))) continue;
    count += numberArray(entry.destroyed).length;
  }
  return count;
}

function constructedBuildingTimes(player: AnyRecord, patterns: string[]) {
  const times: number[] = [];
  for (const raw of arrayValue(player.buildOrder)) {
    const entry = record(raw);
    if (stringValue(entry.type) !== "Building") continue;
    const icon = stringValue(entry.icon) ?? "";
    if (!patterns.some((pattern) => icon.includes(pattern))) continue;
    times.push(...numberArray(entry.finished).filter((time) => time > 0));
  }
  return times.sort((a, b) => a - b);
}

function analyzeSummary(candidate: ScoredCandidate, summary: unknown) {
  const payload = record(summary);
  const players = arrayValue(payload.players).map(record);
  const winner = candidate.game.players.find((player) => player.result === "win");
  const loser = candidate.game.players.find((player) => player.result === "loss");
  if (!winner) return;

  const winnerSummary =
    players.find((player) => stringValue(player.profileId, player.profile_id) === winner.profileId) ??
    players.find((player) => stringValue(player.name) === winner.name);
  const loserSummary =
    loser &&
    (players.find((player) => stringValue(player.profileId, player.profile_id) === loser.profileId) ??
      players.find((player) => stringValue(player.name) === loser.name));
  if (!winnerSummary) return;

  const castleTime = actionTime(winnerSummary, "castleAge");
  if (castleTime != null && castleTime <= 660 && (candidate.game.durationSeconds ?? 0) >= 20 * 60) {
    addSummaryReason(candidate, "summary_fast_castle", `Game summary: fast Castle Age at ${Math.floor(castleTime / 60)}:${String(castleTime % 60).padStart(2, "0")}`, 6, "Fast Castle");
  }
  const imperialTime = actionTime(winnerSummary, "imperialAge");
  if (imperialTime != null && imperialTime <= 1500 && (candidate.game.durationSeconds ?? 0) >= 25 * 60) {
    addSummaryReason(candidate, "summary_fast_imperial", `Game summary: fast Imperial Age at ${Math.floor(imperialTime / 60)}:${String(imperialTime % 60).padStart(2, "0")}`, 10, "Fast Imperial");
  }
  const feudalTime = actionTime(winnerSummary, "feudalAge");
  if (feudalTime != null && feudalTime >= 420) {
    addSummaryReason(candidate, "summary_late_feudal", `Game summary: delayed Feudal Age at ${Math.floor(feudalTime / 60)}:${String(feudalTime % 60).padStart(2, "0")}`, 8, "Odd timing");
  }
  const firstMilitary = firstMilitaryProductionTime(winnerSummary);
  if (firstMilitary != null && firstMilitary <= 180) {
    addSummaryReason(candidate, "summary_dark_age_aggression", `Game summary: military unit produced before 3 minutes`, 12, "Dark age pressure");
  } else if (firstMilitary != null && firstMilitary >= 600 && (candidate.game.durationSeconds ?? 0) >= 18 * 60) {
    addSummaryReason(candidate, "summary_delayed_military", `Game summary: first military unit after 10 minutes`, 12, "Odd build");
  }

  const extraTownCenterTimes = constructedBuildingTimes(winnerSummary, [
    "town_center",
    "town_centre",
    "town_centre_capitol",
    "town_centre_capital",
  ]);
  if (extraTownCenterTimes.length >= 2) {
    const secondTcTime = extraTownCenterTimes[1];
    addSummaryReason(
      candidate,
      "summary_multi_tc",
      `Game summary: winner went multiple Town Centers, second TC completed at ${Math.floor(secondTcTime / 60)}:${String(secondTcTime % 60).padStart(2, "0")}`,
      8,
      "Multi-TC",
    );
  } else if (extraTownCenterTimes.length === 1 && extraTownCenterTimes[0] >= 180) {
    const secondTcTime = extraTownCenterTimes[0];
    addSummaryReason(
      candidate,
      "summary_multi_tc",
      `Game summary: winner added a second Town Center at ${Math.floor(secondTcTime / 60)}:${String(secondTcTime % 60).padStart(2, "0")}`,
      8,
      "Multi-TC",
    );
  }

  if (loserSummary) {
    const timestamps = numberArray(record(winnerSummary.resources).timestamps);
    const winnerScores = numberArray(record(winnerSummary.scores).total);
    const loserScores = numberArray(record(loserSummary.scores).total);
    let maxScoreDeficit = 0;
    for (let index = 0; index < timestamps.length; index += 1) {
      if (timestamps[index] < 600) continue;
      const winnerScore = valueAt(winnerScores, index);
      const loserScore = valueAt(loserScores, index);
      if (winnerScore == null || loserScore == null || loserScore <= 0) continue;
      maxScoreDeficit = Math.max(maxScoreDeficit, (loserScore - winnerScore) / loserScore);
    }
    if (maxScoreDeficit >= 0.3) {
      addSummaryReason(candidate, "summary_huge_score_comeback", `Game summary: winner was behind by ${Math.round(maxScoreDeficit * 100)}% score after 10 minutes`, 34, "Huge comeback");
    } else if (maxScoreDeficit >= 0.2) {
      addSummaryReason(candidate, "summary_score_comeback", `Game summary: winner was behind by ${Math.round(maxScoreDeficit * 100)}% score after 10 minutes`, 22, "Comeback");
    }

    let maxVillagerDeficit = 0;
    for (const timestamp of timestamps.filter((time) => time >= 600)) {
      const winnerVillagers = villagerCountAt(winnerSummary, timestamp);
      const loserVillagers = villagerCountAt(loserSummary, timestamp);
      if (winnerVillagers == null || loserVillagers == null) continue;
      maxVillagerDeficit = Math.max(maxVillagerDeficit, loserVillagers - winnerVillagers);
    }
    if (maxVillagerDeficit >= 30) {
      addSummaryReason(candidate, "summary_insane_villager_deficit", `Game summary: winner was down ${maxVillagerDeficit} villagers`, 38, "Huge vill deficit");
    } else if (maxVillagerDeficit >= 20) {
      addSummaryReason(candidate, "summary_huge_villager_deficit", `Game summary: winner was down ${maxVillagerDeficit} villagers`, 28, "Villager deficit");
    } else if (maxVillagerDeficit >= 10) {
      addSummaryReason(candidate, "summary_villager_deficit", `Game summary: winner was down ${maxVillagerDeficit} villagers`, 18, "Villager deficit");
    }

    const winnerResources = resourceTotal(winnerSummary.totalResourcesGathered);
    const loserResources = resourceTotal(loserSummary.totalResourcesGathered);
    if (winnerResources > 0 && loserResources > 0 && winnerResources < loserResources) {
      const deficit = (loserResources - winnerResources) / loserResources;
      if (deficit >= 0.25) {
        addSummaryReason(candidate, "summary_huge_resource_deficit", `Game summary: winner gathered ${Math.round(deficit * 100)}% fewer resources`, 30, "Resource deficit");
      } else if (deficit >= 0.15) {
        addSummaryReason(candidate, "summary_resource_deficit", `Game summary: winner gathered ${Math.round(deficit * 100)}% fewer resources`, 20, "Resource deficit");
      }
    }

    const winnerStats = record(winnerSummary._stats);
    const loserStats = record(loserSummary._stats);
    const winnerKills = numberValue(winnerStats.sqkill, winnerStats.ekills) ?? 0;
    const winnerLosses = numberValue(winnerStats.sqlost, winnerStats.edeaths) ?? 0;
    if (winnerKills >= 80 && winnerLosses > 0 && winnerKills / winnerLosses >= 1.5) {
      addSummaryReason(candidate, "summary_military_efficiency", `Game summary: winner had ${winnerKills}-${winnerLosses} unit efficiency`, 16, "Military efficiency");
    }
    const loserKills = numberValue(loserStats.sqkill, loserStats.ekills) ?? 0;
    const loserLosses = numberValue(loserStats.sqlost, loserStats.edeaths) ?? 0;
    if (loserKills > winnerKills && winnerResources < loserResources) {
      addSummaryReason(candidate, "summary_lower_army_resource_win", "Game summary: winner won despite lower kills and fewer gathered resources", 18, "Efficiency outlier");
    }
    if (loserLosses >= 80 && winnerLosses > 0 && loserLosses / winnerLosses >= 1.5) {
      addSummaryReason(candidate, "summary_enemy_bled_units", `Game summary: opponent lost ${loserLosses} units`, 10, "Military efficiency");
    }
  }

  const tcLosses = countDestroyedBuildings(winnerSummary, ["town_center", "town_centre", "town_centre_capitol", "town_centre_capital"]);
  if (tcLosses >= 1) {
    addSummaryReason(candidate, "summary_won_after_losing_tc", "Game summary: winner lost a Town Center and still won", 24, "Lost TC");
  }
  const landmarkLosses = countDestroyedBuildings(winnerSummary, ["building_landmark", "landmark"]);
  if (landmarkLosses >= 2) {
    addSummaryReason(candidate, "summary_lost_multiple_landmarks", `Game summary: winner lost ${landmarkLosses} landmarks and still won`, 28, "Lost landmarks");
  }

  const winReason = stringValue(payload.winReason, payload.win_reason);
  if (winReason && !["surrender", "elimination"].includes(winReason.toLowerCase())) {
    addSummaryReason(candidate, "summary_rare_win_condition", `Game summary: unusual win condition (${winReason})`, 32, "Rare win condition");
  }

  if (loserSummary) {
    const winnerApm = numberValue(winnerSummary.apm);
    const loserApm = numberValue(loserSummary.apm);
    if (winnerApm != null && loserApm != null && winnerApm <= loserApm * 0.65) {
      addSummaryReason(candidate, "summary_low_apm_win", `Game summary: winner had ${winnerApm} APM vs opponent's ${loserApm}`, 12, "Low APM win");
    }
  }
}

async function fetchGameSummary(game: AoeGame) {
  const profileIds = game.players.map((player) => player.profileId);
  for (const profileId of profileIds) {
    try {
      const url = new URL(`https://aoe4world.com/players/${profileId}/games/${game.aoe4worldGameId}/summary`);
      url.searchParams.set("camelize", "true");
      const summary = await fetchJson<unknown>(url, 1);
      return {
        summary,
        summaryUrl: `https://aoe4world.com/players/${profileId}/games/${game.aoe4worldGameId}`,
      };
    } catch (error) {
      logger.debug("Game summary fetch skipped", { gameId: game.aoe4worldGameId, profileId, error });
    }
  }
  return null;
}

async function fetchMapCivStat(mapId: number, civilization: string) {
  const cacheKey = `${mapId}|${civilization}`;
  if (mapCivStatCache.has(cacheKey)) return mapCivStatCache.get(cacheKey) ?? null;

  try {
    const url = new URL(`${API_BASE}/stats/rm_solo/maps/${mapId}`);
    const payload = await fetchJson<{ data?: unknown[] }>(url, 1);
    const raw = arrayValue(payload.data).map(record).find((item) => stringValue(item.civilization) === civilization);
    const stat = raw
      ? {
          civilization,
          winRate: numberValue(raw.win_rate, raw.winRate) ?? 50,
          pickRate: numberValue(raw.pick_rate, raw.pickRate) ?? 0,
        }
      : null;
    mapCivStatCache.set(cacheKey, stat);
    return stat;
  } catch (error) {
    logger.debug("Map civ stat fetch skipped", { mapId, civilization, error });
    mapCivStatCache.set(cacheKey, null);
    return null;
  }
}

function addContextualMatchupReason(candidate: ScoredCandidate, matchupStats: Map<string, MatchupStat>, mapStat: CivStat | null) {
  const winner = candidate.game.players.find((player) => player.result === "win");
  const loser = candidate.game.players.find((player) => player.result === "loss");
  if (!winner?.civilization || !loser?.civilization) return;

  const matchupStat = matchupStats.get(`${winner.civilization}|${loser.civilization}`);
  if (!matchupStat) return;

  if (mapStat && mapStat.winRate >= 50) {
    candidate.reasons = candidate.reasons.filter((reason) => !reason.type.includes("matchup"));
    return;
  }

  const context = mapStat
    ? ` and ${mapStat.winRate.toFixed(1)}% win rate on ${candidate.game.map ?? "this map"}`
    : "";
  if (matchupStat.winRate < 42) {
    addSummaryReason(candidate, "very_bad_contextual_matchup_win", `${winner.civilization} has ${matchupStat.winRate.toFixed(1)}% win rate vs ${loser.civilization}${context}`, 30, "Bad matchup");
  } else if (matchupStat.winRate < 45) {
    addSummaryReason(candidate, "bad_contextual_matchup_win", `${winner.civilization} has ${matchupStat.winRate.toFixed(1)}% win rate vs ${loser.civilization}${context}`, 22, "Bad matchup");
  } else if (matchupStat.winRate < 47) {
    addSummaryReason(candidate, "contextual_matchup_upset", `${winner.civilization} has ${matchupStat.winRate.toFixed(1)}% win rate vs ${loser.civilization}${context}`, 14, "Matchup upset");
  }
  if (isEliteGame(candidate.game) && matchupStat.winRate < 47) {
    addSummaryReason(candidate, "elite_bad_matchup_bonus", "Elite-level win in a difficult matchup", 8, "Elite matchup");
  }
}

async function enrichFinalistsWithSummaries(candidates: ScoredCandidate[], matchupStats: Map<string, MatchupStat>) {
  const finalists: ScoredCandidate[] = candidates;
  for (const candidate of finalists) {
    const summaryResult = await fetchGameSummary(candidate.game);
    candidate.summaryAvailable = Boolean(summaryResult);
    candidate.summaryUrl = summaryResult?.summaryUrl ?? null;
    if (summaryResult) {
      analyzeSummary(candidate, summaryResult.summary);
      const payload = record(summaryResult.summary);
      const mapId = candidate.game.mapId ?? intValue(payload.mapId, payload.map_id);
      const winner = candidate.game.players.find((player) => player.result === "win");
      let mapStat: CivStat | null = null;
      if (mapId != null && winner?.civilization) {
        mapStat = await fetchMapCivStat(mapId, winner.civilization);
        if (mapStat) {
          if (mapStat.winRate < 45) {
            addSummaryReason(candidate, "map_disadvantage_win_strong", `${winner.civilization} has ${mapStat.winRate.toFixed(1)}% win rate on ${candidate.game.map ?? "this map"}`, 26, "Map disadvantage");
          } else if (mapStat.winRate < 47) {
            addSummaryReason(candidate, "map_disadvantage_win", `${winner.civilization} has ${mapStat.winRate.toFixed(1)}% win rate on ${candidate.game.map ?? "this map"}`, 18, "Map disadvantage");
          }
          if (isEliteGame(candidate.game) && mapStat.winRate < 47) {
            addSummaryReason(candidate, "elite_map_disadvantage_bonus", "Elite-level win on a difficult map for the winner's civilization", 8, "Elite map angle");
          }
        }
      }
      addContextualMatchupReason(candidate, matchupStats, mapStat);
    }
    await sleep(500);
  }
  return finalists.sort((a, b) => b.score - a.score || b.game.startedAt.getTime() - a.game.startedAt.getTime());
}

async function enrichCandidateWithSummary(candidate: ScoredCandidate, matchupStats: Map<string, MatchupStat>) {
  const enriched = await enrichFinalistsWithSummaries([candidate], matchupStats);
  return enriched[0] ?? candidate;
}

async function selectOutlierCandidates(games: AoeGame[], civStats: Map<string, CivStat>, matchupStats: Map<string, MatchupStat>) {
  const baseCandidates = scoreCandidates(games, civStats);
  const eliteProbes = eliteSummaryProbeCandidates(games, civStats, baseCandidates);
  const unsavedBase = await findUnsavedCandidates(baseCandidates, SUMMARY_FINALIST_COUNT);
  const unsavedEliteProbes = await findUnsavedCandidates(eliteProbes, ELITE_SUMMARY_PROBE_COUNT);
  const finalists = mergeCandidates([...unsavedBase, ...unsavedEliteProbes]);
  const enrichedFinalists = await enrichFinalistsWithSummaries(finalists, matchupStats);
  const qualified = mergeCandidates([...baseCandidates, ...enrichedFinalists]).filter((candidate) => candidate.score >= MIN_SCORE);
  const selected = selectDiverseCandidates(
    qualified.filter((candidate) => finalists.some((finalist) => finalist.game.aoe4worldGameId === candidate.game.aoe4worldGameId)),
    GAMES_TO_SAVE_PER_SCAN,
  );

  return {
    baseCandidates,
    eliteProbes,
    finalists,
    enrichedFinalists,
    qualified,
    selected,
  };
}

async function refreshTrackedPlayersIfNeeded(force = false) {
  const snapshot = await TRACKED_PLAYERS_DOC.get();
  const data = snapshot.data();
  const refreshedAt = data?.refreshedAt instanceof Timestamp ? data.refreshedAt.toDate() : null;
  const ids = Array.isArray(data?.profileIds) ? (data.profileIds as string[]) : [];
  if (!force && ids.length && refreshedAt && Date.now() - refreshedAt.getTime() < 20 * 60 * 60 * 1000) return ids;

  const profileIds: string[] = [];
  for (let page = 1; page <= MAX_LEADERBOARD_PAGES; page += 1) {
    const url = new URL(`${API_BASE}/leaderboards/rm_solo`);
    url.searchParams.set("page", String(page));
    const payload = await fetchJson<{ players?: unknown[] }>(url);
    const players = arrayValue(payload.players);
    for (const raw of players) {
      const player = record(raw);
      const rating = intValue(player.rating);
      const profileId = stringValue(player.profile_id, player.profileId);
      if (profileId && rating != null && rating >= MIN_RATING) profileIds.push(profileId);
    }
    const minRating = Math.min(...players.map((raw) => intValue(record(raw).rating) ?? 0));
    if (!players.length || minRating < MIN_RATING) break;
    await sleep(REQUEST_DELAY_MS);
  }

  await TRACKED_PLAYERS_DOC.set({ profileIds, refreshedAt: FieldValue.serverTimestamp(), minRating: MIN_RATING }, { merge: true });
  await PUBLIC_STATUS_DOC.set({ trackedPlayers: profileIds.length }, { merge: true });
  return profileIds;
}

async function loadCivStats() {
  const url = new URL(`${API_BASE}/stats/rm_solo/civilizations`);
  const payload = await fetchJson<{ data?: unknown[] }>(url);
  const stats = new Map<string, CivStat>();
  for (const raw of arrayValue(payload.data)) {
    const item = record(raw);
    const civilization = stringValue(item.civilization);
    if (!civilization) continue;
    stats.set(civilization, {
      civilization,
      winRate: numberValue(item.win_rate, item.winRate) ?? 50,
      pickRate: numberValue(item.pick_rate, item.pickRate) ?? 100,
    });
  }
  return stats;
}

async function loadMatchupStats() {
  const url = new URL(`${API_BASE}/stats/rm_solo/matchups`);
  const payload = await fetchJson<{ data?: unknown[] }>(url);
  const stats = new Map<string, MatchupStat>();
  for (const raw of arrayValue(payload.data)) {
    const item = record(raw);
    const civilization = stringValue(item.civilization);
    const otherCivilization = stringValue(item.other_civilization, item.otherCivilization);
    if (!civilization || !otherCivilization) continue;
    const stat = {
      civilization,
      otherCivilization,
      winRate: numberValue(item.win_rate, item.winRate) ?? 50,
      gamesCount: intValue(item.games_count, item.gamesCount) ?? 0,
    };
    stats.set(`${civilization}|${otherCivilization}`, stat);
  }
  return stats;
}

function rotateProfileIds(profileIds: string[], offset: number) {
  if (!profileIds.length) return [];
  const start = Math.max(0, offset) % profileIds.length;
  return [...profileIds.slice(start), ...profileIds.slice(0, start)];
}

function nextPlayerOffset(startOffset: number, batchesChecked: number, playerCount: number) {
  if (!playerCount) return 0;
  return (startOffset + batchesChecked * BATCH_SIZE) % playerCount;
}

async function fetchCandidateGames(profileIds: string[], since: Date, excludedGameIds = new Set<string>(), startPlayerOffset = 0) {
  const games = new Map<string, AoeGame>();
  const normalizedStartOffset = profileIds.length ? Math.max(0, startPlayerOffset) % profileIds.length : 0;
  const rotatedProfileIds = rotateProfileIds(profileIds, normalizedStartOffset);
  const diagnostics: FetchDiagnostics = {
    apiRequestsMade: 0,
    rawGamesFetched: 0,
    skippedAlreadyExcluded: 0,
    skippedLowRating: 0,
    skippedInvalid: 0,
    eligibleGamesCollected: 0,
    freshGamesCollected: 0,
    startPlayerOffset: normalizedStartOffset,
    nextPlayerOffset: normalizedStartOffset,
    playerBatchesChecked: 0,
  };

  function shouldStopRequesting() {
    if (games.size >= MAX_GAMES_PER_SCAN) return true;
    if (diagnostics.apiRequestsMade >= ADAPTIVE_MAX_GAME_REQUESTS_PER_SCAN) return true;
    return diagnostics.apiRequestsMade >= MAX_GAME_REQUESTS_PER_SCAN && games.size >= MIN_FRESH_GAMES_BEFORE_STOPPING;
  }

  for (let index = 0; index < rotatedProfileIds.length; index += BATCH_SIZE) {
    const batch = rotatedProfileIds.slice(index, index + BATCH_SIZE);
    diagnostics.playerBatchesChecked += 1;
    diagnostics.nextPlayerOffset = nextPlayerOffset(normalizedStartOffset, diagnostics.playerBatchesChecked, profileIds.length);
    const base = new URL(`${API_BASE}/games`);
    base.searchParams.set("leaderboard", "rm_1v1");
    base.searchParams.set("since", since.toISOString());
    base.searchParams.set("order", "started_at");
    base.searchParams.set("profile_ids", batch.join(","));
    base.searchParams.set("per_page", "50");

    for (let page = 1; page <= MAX_GAME_PAGES_PER_BATCH; page += 1) {
      const url = new URL(base);
      url.searchParams.set("page", String(page));
      diagnostics.apiRequestsMade += 1;
      const payload = await fetchJson<{ games?: unknown[]; count?: number; per_page?: number }>(url);
      const rawGames = arrayValue(payload.games);
      diagnostics.rawGamesFetched += rawGames.length;
      for (const rawGame of rawGames) {
        const rawId = stringValue(record(rawGame).game_id, record(rawGame).id, record(rawGame).match_id);
        if (rawId && excludedGameIds.has(rawId)) {
          diagnostics.skippedAlreadyExcluded += 1;
          continue;
        }
        const game = normalizeGame(rawGame);
        if (!game) {
          diagnostics.skippedInvalid += 1;
          continue;
        }
        if (excludedGameIds.has(game.aoe4worldGameId)) {
          diagnostics.skippedAlreadyExcluded += 1;
          continue;
        }
        if ((game.averageRating ?? 0) < MIN_RATING && (game.averageMmr ?? 0) < MIN_RATING) {
          diagnostics.skippedLowRating += 1;
          continue;
        }
        games.set(game.aoe4worldGameId, game);
        diagnostics.eligibleGamesCollected = games.size;
        diagnostics.freshGamesCollected = games.size;
        if (games.size >= MAX_GAMES_PER_SCAN) return { games: Array.from(games.values()).slice(0, MAX_GAMES_PER_SCAN), diagnostics };
      }
      if ((payload.count ?? 0) < (payload.per_page ?? 50)) break;
      if (shouldStopRequesting()) break;
      await sleep(REQUEST_DELAY_MS);
    }
    if (shouldStopRequesting()) break;
    await sleep(REQUEST_DELAY_MS);
  }
  diagnostics.freshGamesCollected = games.size;
  return { games: Array.from(games.values()).slice(0, MAX_GAMES_PER_SCAN), diagnostics };
}

async function pruneExpiredFallback() {
  try {
    const expired = await OUTLIER_COLLECTION.where("expiresAt", "<", Timestamp.fromDate(new Date())).limit(25).get();
    const batch = db.batch();
    expired.docs.forEach((doc) => batch.delete(doc.ref));
    if (!expired.empty) await batch.commit();
  } catch (error) {
    logger.warn("Expired outlier fallback cleanup skipped", error);
  }
}

async function acquireScanLock(owner: string) {
  const expiresAt = new Date(Date.now() + 9 * 60 * 1000);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(SCAN_LOCK_DOC);
    const data = snapshot.data();
    const lockedUntil = data?.lockedUntil instanceof Timestamp ? data.lockedUntil.toDate() : null;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      return { acquired: false, lockedUntil, owner: stringValue(data?.owner) };
    }

    transaction.set(
      SCAN_LOCK_DOC,
      {
        owner,
        lockedAt: FieldValue.serverTimestamp(),
        lockedUntil: Timestamp.fromDate(expiresAt),
      },
      { merge: true },
    );
    return { acquired: true, lockedUntil: expiresAt, owner };
  });
}

async function releaseScanLock(owner: string) {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(SCAN_LOCK_DOC);
    const data = snapshot.data();
    if (stringValue(data?.owner) === owner) {
      transaction.set(
        SCAN_LOCK_DOC,
        {
          owner: null,
          releasedAt: FieldValue.serverTimestamp(),
          lockedUntil: Timestamp.fromDate(new Date(0)),
        },
        { merge: true },
      );
    }
  });
}

async function runScan(forcePlayers = false, options: { allowDeepFallback?: boolean; owner?: string } = {}) {
  const owner = options.owner ?? crypto.randomUUID();
  const lock = await acquireScanLock(owner);
  if (!lock.acquired) {
    return {
      ok: false,
      skipped: true,
      reason: "scan_already_running",
      lockedUntil: lock.lockedUntil?.toISOString() ?? null,
      owner: lock.owner ?? null,
    };
  }

  const scanRef = db.collection("scanRuns").doc();
  await scanRef.set({ status: "running", startedAt: FieldValue.serverTimestamp(), type: "hourly_outlier_scan" });

  try {
    await pruneExpiredFallback();
    const primarySince = new Date(Date.now() - PRIMARY_LOOKBACK_HOURS * 60 * 60 * 1000);
    const expandedSince = new Date(Date.now() - CANDIDATE_LOOKBACK_HOURS * 60 * 60 * 1000);
    const [profileIds, civStats, matchupStats] = await Promise.all([
      refreshTrackedPlayersIfNeeded(forcePlayers),
      loadCivStats(),
      loadMatchupStats(),
    ]);
    const excludedGameIds = await loadExcludedGameIds();
    const scanStateSnapshot = await SCAN_STATE_DOC.get();
    const scanState = scanStateSnapshot.data();
    const startPlayerOffset = intValue(scanState?.nextPlayerOffset) ?? 0;

    const primaryFetch = await fetchCandidateGames(profileIds, primarySince, excludedGameIds, startPlayerOffset);
    const primaryGames = primaryFetch.games;
    let games = primaryGames;
    let fetchDiagnostics = primaryFetch.diagnostics;
    let expandedFetchDiagnostics: FetchDiagnostics | null = null;
    let selection = await selectOutlierCandidates(primaryGames, civStats, matchupStats);
    let rejectedCached = await rememberRejectedGames(primaryGames, selection.qualified);
    let lookbackHours = PRIMARY_LOOKBACK_HOURS;
    let expanded = false;

    if (options.allowDeepFallback !== false && selection.selected.length < GAMES_TO_SAVE_PER_SCAN) {
      const expandedFetch = await fetchCandidateGames(profileIds, expandedSince, excludedGameIds, primaryFetch.diagnostics.nextPlayerOffset);
      const expandedGames = expandedFetch.games;
      games = expandedGames;
      fetchDiagnostics = expandedFetch.diagnostics;
      expandedFetchDiagnostics = expandedFetch.diagnostics;
      selection = await selectOutlierCandidates(expandedGames, civStats, matchupStats);
      rejectedCached = await rememberRejectedGames(expandedGames, selection.qualified);
      lookbackHours = CANDIDATE_LOOKBACK_HOURS;
      expanded = true;
    }

    for (const candidate of selection.selected) {
      const expiresAt = new Date(candidate.game.startedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
      await OUTLIER_COLLECTION.doc(candidate.game.aoe4worldGameId).set({
        ...candidate.game,
        startedAt: Timestamp.fromDate(candidate.game.startedAt),
        updatedAt: candidate.game.updatedAt ? Timestamp.fromDate(candidate.game.updatedAt) : null,
        selectedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
        score: candidate.score,
        summaryAvailable: candidate.summaryAvailable ?? null,
        summaryUrl: candidate.summaryUrl ?? null,
        reasons: candidate.reasons,
        tags: candidate.tags,
        matchupStats: candidate.matchupStats,
      });
    }

    const now = FieldValue.serverTimestamp();
    const selectedGameIds = selection.selected.map((candidate) => candidate.game.aoe4worldGameId);
    const selectedGameUrls = Object.fromEntries(
      selection.selected.map((candidate) => [candidate.game.aoe4worldGameId, candidate.summaryUrl ?? candidate.game.aoe4worldUrl]),
    );
    const totalApiRequestsMade = primaryFetch.diagnostics.apiRequestsMade + (expandedFetchDiagnostics?.apiRequestsMade ?? 0);
    const totalRawGamesFetched = primaryFetch.diagnostics.rawGamesFetched + (expandedFetchDiagnostics?.rawGamesFetched ?? 0);
    const totalSkippedAlreadyExcluded =
      primaryFetch.diagnostics.skippedAlreadyExcluded + (expandedFetchDiagnostics?.skippedAlreadyExcluded ?? 0);
    const totalSkippedLowRating = primaryFetch.diagnostics.skippedLowRating + (expandedFetchDiagnostics?.skippedLowRating ?? 0);
    const totalSkippedInvalid = primaryFetch.diagnostics.skippedInvalid + (expandedFetchDiagnostics?.skippedInvalid ?? 0);
    const totalEligibleGamesCollected =
      primaryFetch.diagnostics.eligibleGamesCollected + (expandedFetchDiagnostics?.eligibleGamesCollected ?? 0);
    await markFreshPicks(selectedGameIds);
    const message = selection.selected.length
      ? `Stored ${selection.selected.length} games: ${selectedGameIds.join(", ")}.`
      : selection.qualified.length
        ? `Found ${selection.qualified.length} qualified candidates, but none were selected after filtering.`
        : `No candidate crossed score ${MIN_SCORE}.`;
    await Promise.all([
      SCAN_STATE_DOC.set(
        {
          lastCursor: now,
          lastCheckedSince: Timestamp.fromDate(expanded ? expandedSince : primarySince),
          nextPlayerOffset: fetchDiagnostics.nextPlayerOffset,
        },
        { merge: true },
      ),
      PUBLIC_STATUS_DOC.set({ lastSuccessfulScanAt: now, lastScanMessage: message, trackedPlayers: profileIds.length }, { merge: true }),
      scanRef.set(
        {
          status: "success",
          finishedAt: now,
          gamesChecked: games.length,
          candidatesFound: selection.qualified.length,
          baseCandidatesFound: selection.baseCandidates.length,
          eliteProbesChecked: selection.eliteProbes.length,
          qualifiedAfterSummary: selection.qualified.length,
          lookbackHours,
          expandedLookback: expanded,
          primaryGamesChecked: primaryGames.length,
          expandedGamesChecked: expanded ? games.length : 0,
          selectedGameId: selectedGameIds[0] ?? null,
          selectedGameIds,
          selectedGameUrls,
          storedCount: selection.selected.length,
          summaryFinalistsChecked: selection.finalists.length,
          excludedGames: excludedGameIds.size,
          rejectedCached,
          totalApiRequestsMade,
          apiRequestsMade: fetchDiagnostics.apiRequestsMade,
          primaryApiRequestsMade: primaryFetch.diagnostics.apiRequestsMade,
          expandedApiRequestsMade: expandedFetchDiagnostics?.apiRequestsMade ?? 0,
          totalRawGamesFetched,
          rawGamesFetched: fetchDiagnostics.rawGamesFetched,
          primaryRawGamesFetched: primaryFetch.diagnostics.rawGamesFetched,
          expandedRawGamesFetched: expandedFetchDiagnostics?.rawGamesFetched ?? 0,
          totalSkippedAlreadyExcluded,
          skippedAlreadyExcluded: fetchDiagnostics.skippedAlreadyExcluded,
          primarySkippedAlreadyExcluded: primaryFetch.diagnostics.skippedAlreadyExcluded,
          expandedSkippedAlreadyExcluded: expandedFetchDiagnostics?.skippedAlreadyExcluded ?? 0,
          totalSkippedLowRating,
          skippedLowRating: fetchDiagnostics.skippedLowRating,
          primarySkippedLowRating: primaryFetch.diagnostics.skippedLowRating,
          expandedSkippedLowRating: expandedFetchDiagnostics?.skippedLowRating ?? 0,
          totalSkippedInvalid,
          skippedInvalid: fetchDiagnostics.skippedInvalid,
          primarySkippedInvalid: primaryFetch.diagnostics.skippedInvalid,
          expandedSkippedInvalid: expandedFetchDiagnostics?.skippedInvalid ?? 0,
          totalEligibleGamesCollected,
          eligibleGamesCollected: fetchDiagnostics.eligibleGamesCollected,
          primaryEligibleGamesCollected: primaryFetch.diagnostics.eligibleGamesCollected,
          expandedEligibleGamesCollected: expandedFetchDiagnostics?.eligibleGamesCollected ?? 0,
          freshGamesCollected: fetchDiagnostics.freshGamesCollected,
          primaryFreshGamesCollected: primaryFetch.diagnostics.freshGamesCollected,
          expandedFreshGamesCollected: expandedFetchDiagnostics?.freshGamesCollected ?? 0,
          startPlayerOffset: fetchDiagnostics.startPlayerOffset,
          primaryStartPlayerOffset: primaryFetch.diagnostics.startPlayerOffset,
          expandedStartPlayerOffset: expandedFetchDiagnostics?.startPlayerOffset ?? null,
          nextPlayerOffset: fetchDiagnostics.nextPlayerOffset,
          primaryNextPlayerOffset: primaryFetch.diagnostics.nextPlayerOffset,
          expandedNextPlayerOffset: expandedFetchDiagnostics?.nextPlayerOffset ?? null,
          playerBatchesChecked: fetchDiagnostics.playerBatchesChecked,
          primaryPlayerBatchesChecked: primaryFetch.diagnostics.playerBatchesChecked,
          expandedPlayerBatchesChecked: expandedFetchDiagnostics?.playerBatchesChecked ?? 0,
          ignoredGameTtlHours: IGNORED_GAME_TTL_HOURS,
          message,
        },
        { merge: true },
      ),
    ]);
    const { homepageHighlightCount, archiveSnapshotCount } = await updatePublicMetaSnapshots();

    return {
      ok: true,
      gamesChecked: games.length,
      candidatesFound: selection.qualified.length,
      baseCandidatesFound: selection.baseCandidates.length,
      eliteProbesChecked: selection.eliteProbes.length,
      qualifiedAfterSummary: selection.qualified.length,
      lookbackHours,
      expandedLookback: expanded,
      primaryGamesChecked: primaryGames.length,
      expandedGamesChecked: expanded ? games.length : 0,
      selectedGameId: selectedGameIds[0] ?? null,
      selectedGameIds,
      selectedGameUrls,
      storedCount: selection.selected.length,
      summaryFinalistsChecked: selection.finalists.length,
      excludedGames: excludedGameIds.size,
      rejectedCached,
      totalApiRequestsMade,
      apiRequestsMade: fetchDiagnostics.apiRequestsMade,
      primaryApiRequestsMade: primaryFetch.diagnostics.apiRequestsMade,
      expandedApiRequestsMade: expandedFetchDiagnostics?.apiRequestsMade ?? 0,
      totalRawGamesFetched,
      rawGamesFetched: fetchDiagnostics.rawGamesFetched,
      primaryRawGamesFetched: primaryFetch.diagnostics.rawGamesFetched,
      expandedRawGamesFetched: expandedFetchDiagnostics?.rawGamesFetched ?? 0,
      totalSkippedAlreadyExcluded,
      skippedAlreadyExcluded: fetchDiagnostics.skippedAlreadyExcluded,
      primarySkippedAlreadyExcluded: primaryFetch.diagnostics.skippedAlreadyExcluded,
      expandedSkippedAlreadyExcluded: expandedFetchDiagnostics?.skippedAlreadyExcluded ?? 0,
      totalSkippedLowRating,
      skippedLowRating: fetchDiagnostics.skippedLowRating,
      primarySkippedLowRating: primaryFetch.diagnostics.skippedLowRating,
      expandedSkippedLowRating: expandedFetchDiagnostics?.skippedLowRating ?? 0,
      totalSkippedInvalid,
      skippedInvalid: fetchDiagnostics.skippedInvalid,
      primarySkippedInvalid: primaryFetch.diagnostics.skippedInvalid,
      expandedSkippedInvalid: expandedFetchDiagnostics?.skippedInvalid ?? 0,
      totalEligibleGamesCollected,
      eligibleGamesCollected: fetchDiagnostics.eligibleGamesCollected,
      primaryEligibleGamesCollected: primaryFetch.diagnostics.eligibleGamesCollected,
      expandedEligibleGamesCollected: expandedFetchDiagnostics?.eligibleGamesCollected ?? 0,
      freshGamesCollected: fetchDiagnostics.freshGamesCollected,
      primaryFreshGamesCollected: primaryFetch.diagnostics.freshGamesCollected,
      expandedFreshGamesCollected: expandedFetchDiagnostics?.freshGamesCollected ?? 0,
      startPlayerOffset: fetchDiagnostics.startPlayerOffset,
      primaryStartPlayerOffset: primaryFetch.diagnostics.startPlayerOffset,
      expandedStartPlayerOffset: expandedFetchDiagnostics?.startPlayerOffset ?? null,
      nextPlayerOffset: fetchDiagnostics.nextPlayerOffset,
      primaryNextPlayerOffset: primaryFetch.diagnostics.nextPlayerOffset,
      expandedNextPlayerOffset: expandedFetchDiagnostics?.nextPlayerOffset ?? null,
      playerBatchesChecked: fetchDiagnostics.playerBatchesChecked,
      primaryPlayerBatchesChecked: primaryFetch.diagnostics.playerBatchesChecked,
      expandedPlayerBatchesChecked: expandedFetchDiagnostics?.playerBatchesChecked ?? 0,
      ignoredGameTtlHours: IGNORED_GAME_TTL_HOURS,
      homepageHighlightCount,
      archiveSnapshotCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scan error";
    await Promise.all([
      PUBLIC_STATUS_DOC.set({ lastScanMessage: message }, { merge: true }),
      scanRef.set({ status: "failed", finishedAt: FieldValue.serverTimestamp(), error: message }, { merge: true }),
    ]);
    throw error;
  } finally {
    await releaseScanLock(owner);
  }
}

function storedDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  return dateValue(value) ?? new Date(0);
}

function storedGameFromData(id: string, data: AnyRecord): AoeGame {
  const players = arrayValue(data.players).map((raw, index) => {
    const player = record(raw);
    return {
      profileId: stringValue(player.profileId, player.profile_id) ?? crypto.randomUUID(),
      name: stringValue(player.name) ?? "Unknown player",
      civilization: stringValue(player.civilization),
      rating: intValue(player.rating),
      mmr: intValue(player.mmr),
      ratingDiff: intValue(player.ratingDiff, player.rating_diff),
      mmrDiff: intValue(player.mmrDiff, player.mmr_diff),
      result: stringValue(player.result),
      team: intValue(player.team) ?? index + 1,
      inputType: stringValue(player.inputType, player.input_type),
      social: socialLinks(player.social),
    };
  });

  return {
    aoe4worldGameId: stringValue(data.aoe4worldGameId, data.aoe4world_game_id) ?? id,
    aoe4worldUrl: stringValue(data.aoe4worldUrl, data.aoe4world_url) ?? `https://aoe4world.com/games/${id}`,
    startedAt: storedDate(data.startedAt),
    updatedAt: data.updatedAt ? storedDate(data.updatedAt) : null,
    mapId: intValue(data.mapId, data.map_id),
    map: stringValue(data.map),
    durationSeconds: intValue(data.durationSeconds, data.duration_seconds),
    patch: stringValue(data.patch),
    season: stringValue(data.season),
    averageRating: intValue(data.averageRating, data.average_rating),
    averageMmr: intValue(data.averageMmr, data.average_mmr),
    civilizations: arrayValue(data.civilizations).map((civ) => stringValue(civ)).filter((civ): civ is string => Boolean(civ)),
    players,
  };
}

function storedOutlierFromData(id: string, data: AnyRecord): StoredOutlierGame {
  const game = storedGameFromData(id, data);
  return {
    ...game,
    id,
    selectedAt: storedDate(data.selectedAt),
    expiresAt: storedDate(data.expiresAt),
    score: numberValue(data.score) ?? 0,
    summaryAvailable: typeof data.summaryAvailable === "boolean" ? data.summaryAvailable : null,
    summaryUrl: stringValue(data.summaryUrl) ?? null,
    reasons: arrayValue(data.reasons).map(record).map((reason) => ({
      type: stringValue(reason.type) ?? "unknown",
      label: stringValue(reason.label) ?? "Unknown reason",
      weight: numberValue(reason.weight) ?? 0,
    })),
    tags: arrayValue(data.tags).map((tag) => stringValue(tag)).filter((tag): tag is string => Boolean(tag)),
    matchupStats: (data.matchupStats as StoredOutlierGame["matchupStats"]) ?? null,
    isFreshPick: Boolean(data.isFreshPick),
  };
}

async function updateHomepageHighlights() {
  const snapshot = await OUTLIER_COLLECTION.where("expiresAt", ">=", Timestamp.fromDate(new Date())).limit(250).get();
  const games = snapshot.docs
    .map((doc) => storedOutlierFromData(doc.id, record(doc.data())))
    .sort((a, b) => b.selectedAt.getTime() - a.selectedAt.getTime());
  const highlights = selectHomepageHighlights(games);
  await HOMEPAGE_HIGHLIGHTS_DOC.set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      highlights,
    },
    { merge: true },
  );
  return highlights.length;
}

async function updateArchiveSnapshot() {
  const snapshot = await OUTLIER_COLLECTION.where("expiresAt", ">=", Timestamp.fromDate(new Date())).limit(ARCHIVE_SNAPSHOT_LIMIT).get();
  const games = snapshot.docs
    .map((doc) => storedOutlierFromData(doc.id, record(doc.data())))
    .sort((a, b) => b.selectedAt.getTime() - a.selectedAt.getTime())
    .slice(0, ARCHIVE_SNAPSHOT_LIMIT)
    .map(serializeStoredOutlierGame);

  await ARCHIVE_SNAPSHOT_DOC.set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      limit: ARCHIVE_SNAPSHOT_LIMIT,
      count: games.length,
      games,
    },
    { merge: true },
  );
  return games.length;
}

async function updatePublicMetaSnapshots() {
  const [homepageHighlightCount, archiveSnapshotCount] = await Promise.all([
    updateHomepageHighlights(),
    updateArchiveSnapshot(),
  ]);
  return { homepageHighlightCount, archiveSnapshotCount };
}

async function rescoreSavedOutliers(dryRun = true) {
  const [civStats, matchupStats, snapshot] = await Promise.all([
    loadCivStats(),
    loadMatchupStats(),
    OUTLIER_COLLECTION.where("expiresAt", ">=", Timestamp.fromDate(new Date())).limit(250).get(),
  ]);

  const kept: Array<{ id: string; oldScore: number; newScore: number; summaryAvailable: boolean | null; summaryUrl: string | null }> = [];
  const removed: Array<{ id: string; oldScore: number; newScore: number; reasons: string[] }> = [];
  const skipped: Array<{ id: string; error: string }> = [];
  const batch = db.batch();
  let writes = 0;

  for (const doc of snapshot.docs) {
    try {
      const data = record(doc.data());
      const game = storedGameFromData(doc.id, data);
      const baseScore = scoreGame(game, civStats);
      let candidate: ScoredCandidate = { game, ...baseScore };
      if (candidate.score >= MIN_SCORE) candidate = await enrichCandidateWithSummary(candidate, matchupStats);

      const oldScore = Number(data.score ?? 0);
      if (candidate.score < MIN_SCORE) {
        removed.push({
          id: doc.id,
          oldScore,
          newScore: candidate.score,
          reasons: candidate.reasons.map((reason) => reason.label),
        });
        if (!dryRun) {
          batch.delete(doc.ref);
          writes += 1;
        }
      } else {
        kept.push({
          id: doc.id,
          oldScore,
          newScore: candidate.score,
          summaryAvailable: candidate.summaryAvailable ?? null,
          summaryUrl: candidate.summaryUrl ?? null,
        });
        if (!dryRun) {
          batch.set(
            doc.ref,
            {
              score: candidate.score,
              summaryAvailable: candidate.summaryAvailable ?? null,
              summaryUrl: candidate.summaryUrl ?? null,
              reasons: candidate.reasons,
              tags: candidate.tags,
              matchupStats: candidate.matchupStats ?? null,
              rescoredAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          writes += 1;
        }
      }
      await sleep(250);
    } catch (error) {
      skipped.push({ id: doc.id, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  if (!dryRun && writes > 0) await batch.commit();
  const metaSnapshotCounts = dryRun ? null : await updatePublicMetaSnapshots();

  return {
    ok: true,
    dryRun,
    checked: snapshot.size,
    keptCount: kept.length,
    removedCount: removed.length,
    skippedCount: skipped.length,
    homepageHighlightCount: metaSnapshotCounts?.homepageHighlightCount ?? null,
    archiveSnapshotCount: metaSnapshotCounts?.archiveSnapshotCount ?? null,
    kept,
    removed,
    skipped,
  };
}

export const scanOutliersEveryThreeHours = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Etc/UTC",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const result = await runScan(false, { allowDeepFallback: true, owner: "scheduled" });
    logger.info("Hourly outlier scan complete", result);
  },
);

export const scanOutliersNow = onRequest({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB" }, async (request, response) => {
  const secret = process.env.MANUAL_SCAN_SECRET;
  if (secret && request.query.secret !== secret) {
    response.status(403).json({ ok: false, error: "Forbidden" });
    return;
  }
  const result = await runScan(request.query.refreshPlayers === "true", {
    allowDeepFallback: request.query.deep === "true",
    owner: "manual",
  });
  response.json(result);
});

export const rescoreSavedOutliersNow = onRequest({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB" }, async (request, response) => {
  const secret = process.env.MANUAL_SCAN_SECRET;
  if (secret && request.query.secret !== secret) {
    response.status(403).json({ ok: false, error: "Forbidden" });
    return;
  }
  const dryRun = request.query.dryRun !== "false";
  const result = await rescoreSavedOutliers(dryRun);
  response.json(result);
});
