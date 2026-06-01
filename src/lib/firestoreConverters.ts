import type { DocumentData, QueryDocumentSnapshot, SnapshotOptions, Timestamp } from "firebase/firestore";
import type { OutlierGame, PublicStatus } from "@/lib/types";

function toDate(value: Timestamp | Date | string | null | undefined) {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return value.toDate();
}

export function outlierFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>, options?: SnapshotOptions): OutlierGame {
  const data = snapshot.data(options);
  return {
    id: snapshot.id,
    aoe4worldGameId: String(data.aoe4worldGameId ?? snapshot.id),
    aoe4worldUrl: String(data.aoe4worldUrl ?? `https://aoe4world.com/games/${snapshot.id}`),
    startedAt: toDate(data.startedAt),
    selectedAt: toDate(data.selectedAt),
    expiresAt: toDate(data.expiresAt),
    map: data.map ?? null,
    durationSeconds: data.durationSeconds ?? null,
    patch: data.patch ?? null,
    season: data.season ?? null,
    averageRating: data.averageRating ?? null,
    averageMmr: data.averageMmr ?? null,
    score: Number(data.score ?? 0),
    isFreshPick: Boolean(data.isFreshPick),
    reasons: Array.isArray(data.reasons) ? data.reasons : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    civilizations: Array.isArray(data.civilizations) ? data.civilizations : [],
    players: Array.isArray(data.players) ? data.players : [],
    matchupStats: data.matchupStats ?? null,
  };
}

export function statusFromData(data: DocumentData | undefined): PublicStatus {
  if (!data) return {};
  return {
    lastSuccessfulScanAt: data.lastSuccessfulScanAt ? toDate(data.lastSuccessfulScanAt) : null,
    lastScanMessage: data.lastScanMessage ?? null,
    trackedPlayers: data.trackedPlayers ?? null,
  };
}
