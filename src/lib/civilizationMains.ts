export const CIVILIZATION_MAIN_MIN_MMR = 1500;
export const CIVILIZATION_MAIN_PICK_RATE = 35;
export const CIVILIZATION_MAIN_MIN_GAMES = 25;
export const CIVILIZATION_MAIN_HIGH_PICK_RATE = 75;
export const CIVILIZATION_MAIN_HIGH_MIN_GAMES = 10;

export function qualifiesAsCivilizationMain(pickRate: number, gamesCount: number) {
  return (
    (pickRate >= CIVILIZATION_MAIN_HIGH_PICK_RATE && gamesCount >= CIVILIZATION_MAIN_HIGH_MIN_GAMES) ||
    (pickRate >= CIVILIZATION_MAIN_PICK_RATE && gamesCount >= CIVILIZATION_MAIN_MIN_GAMES)
  );
}
