# AOE4Scanner

AOE4Scanner is a static Next.js frontend backed by Firebase Hosting, Firestore, and Firebase Functions. It saves recent ranked AoE4 1v1 games that look unusually interesting for review, content, or casting.

## What It Does

- Tracks high-level RM 1v1 players from AOE4World.
- Runs a scheduled Firebase Function hourly.
- Scans a limited batch of recent games with conservative delays.
- Scores outlier candidates such as MMR upsets, bad matchup wins, low-win-rate civilization wins, map disadvantage wins, unusual game lengths, comeback signals, villager/resource deficits, and summary-based efficiency signals.
- Saves qualifying games in Firestore for the public feed and archive.
- Keeps saved games for roughly two weeks with Firestore TTL and an expiration cleanup fallback.
- Caches non-qualifying games briefly so future scans do less repeated work.

## Tech Stack

- Next.js static export
- React
- Tailwind CSS
- Firebase Hosting
- Firestore
- Firebase Functions
- AOE4World public endpoints

## Local Development

```bash
npm install
npm run dev
```

The frontend reads public Firestore documents directly from the browser.

## Build Checks

```bash
npm run build
npm run build:functions
```

Or run both:

```bash
npm run build:all
```

## Firebase Setup

1. Create or select the Firebase project.
2. Enable Firestore.
3. Enable Firestore TTL on `outlierGames.expiresAt` and `ignoredGames.expiresAt`.
4. Copy `functions/.env.example` to `functions/.env`.
5. Set a real `AOE4WORLD_USER_AGENT` and `MANUAL_SCAN_SECRET`.
6. Deploy:

```bash
npm run deploy
```

Scheduled Firebase Functions require a billing-enabled Firebase project because they use Cloud Scheduler.

## Environment Variables

Only `functions/.env` should contain private runtime values:

```bash
AOE4WORLD_USER_AGENT="AOE4Scanner/0.1 contact: your-email-or-site"
MANUAL_SCAN_SECRET="replace-with-a-long-random-secret"
```

The Firebase web app config in `src/lib/firebase.ts` is client-side Firebase configuration. It is not a server secret, but Firestore rules must remain locked down so public users can only read the intended collections.

## Manual Operations

All manual operation endpoints require `MANUAL_SCAN_SECRET` to be configured in the function environment and passed as `?secret=<MANUAL_SCAN_SECRET>`. Requests without a matching secret are rejected.

Manual scan:

```text
https://<your-host>/scanOutliersNow?secret=<MANUAL_SCAN_SECRET>
```

Deep manual scan:

```text
https://<your-host>/scanOutliersNow?secret=<MANUAL_SCAN_SECRET>&deep=true
```

Dry-run rescore of saved games:

```text
https://<your-host>/rescoreSavedOutliersNow?secret=<MANUAL_SCAN_SECRET>
```

Apply rescore cleanup:

```text
https://<your-host>/rescoreSavedOutliersNow?secret=<MANUAL_SCAN_SECRET>&dryRun=false
```

Refresh cached landmark analytics:

```text
https://<your-host>/refreshAgeupStatsNow?secret=<MANUAL_SCAN_SECRET>
```

## Public Repo Notes

Do not commit:

- `functions/.env`
- generated Next output: `.next/`, `out/`
- generated function output: `functions/lib/`
- Firebase deploy cache: `.firebase/`
- `node_modules/`

If `MANUAL_SCAN_SECRET` was ever committed or shared publicly, rotate it before relying on the manual endpoints.
