# AOE4Scanner

AOE4Scanner is a static Next.js frontend backed by Firebase Hosting, Firestore, and Firebase Functions. It saves recent ranked AoE4 1v1 games that look unusually interesting for review, content, or casting.

## What It Does

- Tracks RM 1v1 players whose observed match MMR is at least 1700.
- Runs a scheduled Firebase Function hourly.
- Uses the ranked leaderboard only as a broad discovery index down to 1400 rating because AOE4World does not expose an MMR leaderboard; rating never determines final eligibility.
- Scans a limited batch of recent games with conservative delays and accepts games when at least one participant has an observed MMR of 1700 or higher.
- Scores outlier candidates such as MMR upsets, bad matchup wins, low-win-rate civilization wins, map disadvantage wins, unusual game lengths, comeback signals, villager/resource deficits, and summary-based efficiency signals.
- Refreshes civilization-main profiles for newly observed 1700+ MMR players independently of whether their match becomes a saved outlier.
- Rotates through a small cached latest-ranked-game probe so established 1700+ MMR mains can be discovered even when they have not played inside the current scan window.
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
npm run lint
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

The public frontend also supports:

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID="G-..."
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY="..."
```

Google Analytics is consent-gated in the UI. For App Check, register the web app with the reCAPTCHA Enterprise provider, deploy the site key, monitor App Check metrics, and only then enable Cloud Firestore enforcement.

## Public Launch Checklist

- Deploy Hosting, Functions, Firestore rules, and indexes together with `npm run deploy`.
- Run or wait for a successful scanner cycle so `meta/civilizationMainsSnapshot` is populated. This reduces the civilization directory from hundreds of reads per new visitor to one snapshot read.
- In Firebase App Check, register every production domain, deploy the site key, monitor valid and invalid requests, then enable Firestore enforcement.
- In Google Cloud Billing, set a monthly budget and alerts at several thresholds. Budgets notify you; they do not automatically cap spend.
- Enable Cloud Monitoring alerts for function errors, unusually high invocations, and Firestore read spikes.
- Add `https://www.aoe4scanner.com/sitemap.xml` to Google Search Console and verify the canonical `www` domain.
- Confirm the custom domain redirects the non-canonical host and HTTP traffic to `https://www.aoe4scanner.com`.
- Load-test the public pages against a staging Firebase project before announcing broadly.
- Rotate `MANUAL_SCAN_SECRET` before launch if it has ever appeared in shell history, screenshots, logs, or a shared URL.
- Check Firebase and Google Analytics dashboards during the first announcement window.

The `/dev/scans` public route and public access to `scanRuns` are intentionally removed. Operational logs belong in Firebase/Google Cloud consoles, not in a world-readable collection.

## Dependency Notes

Use `npm audit` and `npm --prefix functions audit` as release checks. Avoid `npm audit fix --force` without testing: it can propose framework downgrades or major Firebase Admin upgrades. As of June 22, 2026, the remaining frontend finding is a moderate advisory in Next.js's bundled PostCSS dependency; the automated remediation incorrectly proposes a major downgrade. The remaining Functions findings require a tested major upgrade to Firebase Admin 14.

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
