export type PlayerResult = "win" | "loss" | string;

export type GameParticipant = {
  profileId: string;
  name: string;
  civilization: string | null;
  rating: number | null;
  mmr: number | null;
  ratingDiff: number | null;
  mmrDiff: number | null;
  result: PlayerResult | null;
  team: number;
  inputType: string | null;
  social?: Record<string, string>;
};

export type OutlierReason = {
  type: string;
  label: string;
  weight: number;
};

export type OutlierGame = {
  id: string;
  aoe4worldGameId: string;
  aoe4worldUrl: string;
  startedAt: Date;
  selectedAt: Date;
  expiresAt: Date;
  map: string | null;
  durationSeconds: number | null;
  patch: string | null;
  season: string | null;
  averageRating: number | null;
  averageMmr: number | null;
  score: number;
  isFreshPick?: boolean;
  reasons: OutlierReason[];
  tags: string[];
  civilizations: string[];
  players: GameParticipant[];
  matchupStats?: {
    winnerCivilization: string | null;
    loserCivilization: string | null;
    winnerPickRate: number | null;
    winnerWinRate: number | null;
    loserWinRate: number | null;
  } | null;
};

export type PublicStatus = {
  lastSuccessfulScanAt?: Date | null;
  lastScanMessage?: string | null;
  trackedPlayers?: number | null;
};
