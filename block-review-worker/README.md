# worktrust-block-review

Scheduled Cloudflare Worker that checks every hour for users blocked
more than 24 hours ago and notifies the admin dashboard — replacing
the old client-side "your account will be auto-deleted" illusion in
`BlockedPage.jsx`, which didn't actually delete anything and never
told any admin anything.

## What changed in the main app

- `pages/BlockedPage.jsx` — removed the fake client-side "account
  auto-deleted after 24h" logic and message (nothing was ever
  actually being deleted — it was a countdown timer with a scary
  message attached). Now shows an honest "your block is under review"
  state instead.
- `users/{uid}.blockReviewNotifiedAt` — new field this Worker writes,
  used purely for idempotency (so the same block never gets notified
  twice). Doesn't affect the user experience.
- `admin_notifications` — this Worker creates documents here with
  `type: 'block_review_expired'`, already covered by the existing
  Firestore rule (admin-only read/write) since Workers using a
  service account authenticate via Google's OAuth2/REST API directly,
  bypassing client Firestore rules entirely (the same way the
  worktrust-otp Worker already does for password resets).

## Deploy steps

1. `cd block-review-worker && npm install` (or `npm init -y && npm i -D wrangler` if starting fresh — this folder only has `wrangler.jsonc` + `src/index.js`, no `package.json`/lockfile, since it was written outside a real npm environment here).
2. Set the secrets — you can reuse the **exact same service account** already used by `worktrust-otp`:
   ```
   wrangler secret put FIREBASE_PROJECT_ID
   wrangler secret put FIREBASE_CLIENT_EMAIL
   wrangler secret put FIREBASE_PRIVATE_KEY
   ```
3. `wrangler deploy --env production`
4. Verify the cron is registered: Cloudflare dashboard → Workers → worktrust-block-review → Triggers tab, should show the hourly schedule.
5. To test without waiting an hour, `POST` to the Worker's URL directly (the `fetch` handler runs the same check on-demand) and check the response JSON for `{ notified, skipped, errors, total }`.

## Honesty note

This code is complete and was written to mirror the existing,
already-working `worktrust-otp` Worker's exact authentication
pattern — but it has **not been deployed or run against your live
Firebase project** from this environment (no network access here).
Please verify it end-to-end after deploying: block a test user,
manually set their `bannedAt` field back more than 24 hours (or wait
the full 24h), trigger the Worker, and confirm an `admin_notifications`
document appears.
