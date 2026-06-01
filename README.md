# AOE4Scanner

Static Next.js frontend plus Firebase Functions/Firestore backend for saving one recent AoE4 ranked 1v1 outlier every three hours.

## Local checks

```bash
npm install
npm run build
cd functions
npm install
npm run build
```

## Firebase setup

1. Enable Firestore in the Firebase project `aoe4-scanner`.
2. Enable Firestore TTL for the `outlierGames` collection using the `expiresAt` field. The app also deletes a small batch of expired docs on each scan as a fallback.
3. Copy `functions/.env.example` to `functions/.env` and set a real `AOE4WORLD_USER_AGENT`.
4. Deploy:

```bash
firebase deploy
```

Scheduled Firebase Functions require a billing-enabled Firebase project because they use Cloud Scheduler.

## Scanner behavior

- Refreshes the tracked Conqueror-level player pool about once per day.
- Every three hours, scans recent ranked 1v1 games for those tracked players in slow batches.
- Scores only metadata-reliable outliers: rating/MMR upsets, low-pick civ wins, low-winrate civ wins, civ stat-gap wins, long games, and high-level games.
- Stores only the best new candidate from each run.
- Keeps cards for roughly two weeks via `expiresAt`.
