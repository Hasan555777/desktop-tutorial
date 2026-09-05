# Production Audit & Feature Work — Summary

This covers everything done across this engagement. Organized by the
original request structure. Every fix below has a root cause, not
just a symptom patch — see inline code comments (search for 🔧 FIX,
🔧 ADD, 🔧 UPDATED) for the full reasoning at each change site.

**Verification method for everything in this package:** static
syntax checking (TypeScript's parser, loose mode) on every file
touched. This environment has no network access and no dev server —
nothing here was actually run, built, or deployed. Please build and
test before deploying, especially anything touching money (deposits,
withdrawals, wallet balances) or the Firestore rules.

---

## 1. Original Production Audit

| Item | Root cause found | Fix |
|---|---|---|
| Password reset broken | `.env` never defined `VITE_OTP_API_URL` (the variable the code actually reads) — silently used a hardcoded fallback URL | Fixed `.env`, deleted a dead duplicate OTP implementation |
| Identity docs not reaching admin as "verify" | Resubmitted documents matched against the user's own prior submission (comparing Firestore doc ID against UID, which never match) — false duplicate flags | Fixed the exclude-self comparison |
| Emergency unlock (admin) broken | Checked only Firestore `role` field, not the email whitelist your real admins use to log in | Uses the shared `isAdminUser()` check everywhere now |
| Auto-compress uploads | 6 separate duplicate/inconsistent upload implementations, several skipping compression entirely | Consolidated into one, compression now happens inside `uploadToCloudinary` itself so no caller can forget it |
| App lock not robust | Cross-device/browser breakage (PIN hash never synced from Firestore); lockout bypassable by clearing local storage | Both fixed; PIN verification's client-side nature (a UX shield, not a real security boundary) explained honestly |
| Notification banner: local yes, live no | Two places auto-called `Notification.requestPermission()` without a user gesture — browsers auto-deny that in production (not localhost) | Now only checks existing permission; banner's own click handler does the real request |
| JSX className → CSS Modules migration | Scoped down (per your direction) to shared/reusable components only; paused entirely per your later instruction | 7 UI/Feedback components confirmed already on the target pattern; the rest untouched, your call for later |
| Duplicate/dead files | ~35+ confirmed-dead files removed across the whole audit (stub files, exact duplicates, an entire orphaned old Inbox implementation, orphaned old profile sections) | Deleted only after individually confirming zero references |
| Inconsistent alert/toast systems | 19 files on `react-hot-toast` bypassing your own `FeedbackProvider`; some had a *global* toast renderer missing entirely (silently broken outside Login/Register pages) | **100% migrated now** — zero `react-hot-toast` references left in the app. Also relocated `FeedbackProvider`/`SoundProvider` in `main.jsx` so `AuthContext.jsx` (previously structurally unable to use it) could be migrated too, instead of leaving a permanent exception |

---

## 2. Firestore & Storage Security Rules

**No rules file existed anywhere in this project before this
engagement.** Built from scratch, collection-by-collection, from the
real field names and ownership patterns found in the actual code —
see `firestore-rules/RULES_REPORT.md` for the full collection-by-
collection breakdown and every honestly-flagged limitation.

Highlights:
- `role` and `adminPermissions` on `users/{userId}` can only be
  changed by a main admin — closes the exact self-promotion path that
  would otherwise bypass every admin check in the app.
- Wallet balance changes are mathematically constrained (can't
  increase your own balance client-side) — with an honest note about
  the one operation (escrow release to seller) that really needs a
  Cloud Function for full correctness.
- Chat messages: soft-delete only for regular users (never hard
  delete), 15-minute edit window, enforced server-side.
- Admin RBAC: granular permissions (`users`, `verification`,
  `finance`, `moderation`, `announcements`) enforced with **field-
  level** granularity on the `users` collection — a sub-admin with
  only `verification` permission literally cannot write ban-related
  fields, and vice versa.

**Deploy this via Firebase Console → Firestore → Rules, or `firebase
deploy --only firestore:rules`. Test in the Rules Playground first.**

---

## 3. Navigation & Routing

- Profile and Settings converted from tab-state to real routes
  (`/profile/posts`, `/settings/security`, etc.) — proper back/
  forward/refresh/deep-link support.
- **Caught mid-implementation**: naively adding `/profile/*` would
  have collided with the existing `/profile/:userId` route (viewing
  someone else's profile) — `/profile/posts` could have matched
  `userId="posts"`. Fixed by moving that route to `/profile/user/:userId`
  and updating the 4 places that link to it.
- **Mobile back-button bug**: root cause was 25 separate places
  performing auth-related redirects with `navigate()` instead of
  `navigate(path, { replace: true })` — each one silently stacked a
  phantom history entry. All fixed; deliberate user-initiated
  navigation (buttons, links) left as normal push.
- Admin dashboard: responsive nav — desktop horizontal bar / mobile
  slide-in drawer (Escape key, backdrop click, body-scroll-lock, all
  wired).

---

## 4. Inbox & Chat

**Inbox bugs (all three, root-caused):**
- Duplicate online status — two indicators were genuinely both being
  rendered; kept the more informative one.
- "View Profile" button — was a literal `// future feature` comment,
  never implemented. Wired up.
- 2-3s wrong/missing identity on refresh — `isDataReady` flipped
  true before the referenced users' profiles had actually loaded.
  Reordered; added a skeleton for the (now much shorter) gap.

**Chat features:**
- Edit: added the missing 15-minute window + visible "· Edited" tag.
- Read/unread: found and fixed a real gap (unread only cleared on
  sending, never on opening a chat).
- Delete: was a **hard, permanent delete** — fixed to soft-delete,
  then further hardened after discovering the redacted content was
  still syncing to every participant's client (now properly redacted
  + preserved in an admin-only `messageAudit` collection for dispute
  review).
- Reply: UI existed but silently discarded the reference on send —
  wired through properly.
- Voice messages, document sending, typing indicator: built from
  scratch (none existed before).
- Image viewer: had preview/close only — added zoom, pan, download.

You mentioned reviewing this section yourself later — everything
above is syntax-verified but **not manually tested** by either of us
yet.

---

## 5. Admin Dashboard

- **Deposit/withdrawal duplicate-request lock**: can't submit a new
  request while one is pending. *Honest limitation*: this is a
  client-side check for immediate feedback — true bulletproof
  server-side enforcement of "no duplicate pending docs" needs a
  Cloud Function, since Firestore rules can only validate the single
  document being written, not query across a collection.
- **Configurable withdrawal fee**: admin sets a percentage; requested
  amount, fee, and net payout are all recorded separately.
- **Admin dashboard lock**: password + separate recovery password,
  reusing your existing PIN-hashing infrastructure rather than a
  parallel system.
- **Admin RBAC**: granular permissions, sub-admin management UI,
  audit logging, enforced both client-side (action-level, not just
  hidden navigation) and server-side (Firestore rules, field-level
  granular on the `users` collection).
- **24-hour block review**: replaced a **fake client-side "your
  account has been automatically deleted" illusion** (nothing was
  ever actually deleted — it was a browser timer) with a real
  scheduled Cloudflare Worker that notifies the admin. Never
  auto-deletes anything, matching the actual requirement.

---

## 6. Re-check round (after your "still seeing problems" review)

You were right to push back — a full self-audit against the codebase (not just my own summary) turned up real, confirmed misses:

- **App Lock "Forgot PIN" was completely non-functional.** The "send recovery code" button had a literal `// TODO: Implement actual OTP send logic` — no email was ever sent, just a fake 1.5s delay before claiming success. The actual verification checked against real recovery codes generated in Settings → Security, but the two flows were never connected. Fixed: removed the fake email step entirely, wired directly to the real, working recovery-code system.
- **Loading system was built but barely adopted** — the shared top-loading-bar hook existed but was used in 1 of 31 pages. Wired into 19 major pages (Profile, Wallet, Withdraw, Deposit, Settings, Notifications, etc.).
- **Zero code-splitting anywhere** — every visitor's first page load downloaded the entire Admin Dashboard's code even if they were never an admin. 14 heavy, not-always-needed pages (Admin, Withdraw, Wallet, Deposit, Settings, Transactions, etc.) are now lazy-loaded with a proper loading fallback.
- Found and removed one more dead file (`DevSoundTest.jsx` — a developer sound-testing page, not routed anywhere, but exactly the kind of leftover you asked to be swept for).
- Checked several candidates for the "says updated but isn't" complaint (Settings profile save, adding experience) — both were actually implemented correctly (success only shown after the write completes). Didn't find a confirmed instance of this specific bug; if you hit it again, the exact button/field will make it much faster to find.

## What's genuinely still open

- Chat/inbox: functionally complete but you haven't reviewed it yet.
- A handful of admin actions beyond the ones explicitly wired
  (deposit/withdrawal approval, editing another user) still check
  broad `isAdmin()` rather than granular permissions — the RBAC
  *foundation* (roles, enforcement pattern, audit log) is real and
  complete; extending it to every single admin action individually
  wasn't done.
- Business policy questions in `rules/index.js` (minimum/maximum
  withdrawal amounts, email-change limits, cancellation penalties,
  etc.) were never implemented — these are product decisions, not
  something inferable from code. Give me actual numbers/policies and
  I'll write the enforcement.
- `block-review-worker/` and the existing `worktrust-otp` worker
  need deployment (`wrangler deploy`) — not done from this
  environment, no network access here.

## Deployment checklist

1. `npm install`, fill in `.env` from `.env.example`.
2. Deploy Firestore rules (`firestore-rules/firestore.rules`) —
   **test in the Rules Playground first**, this changed a lot.
3. Deploy `firestore-rules/storage.rules` too (closes Storage
   entirely, since Cloudinary handles your actual uploads).
4. Deploy `block-review-worker/` (see its own README) and confirm
   the existing `worktrust-otp` worker still has its secrets set.
5. Rotate the Firebase service-account key and Gemini API key that
   were in your original upload — flagged as exposed back at the
   start of this engagement.
6. Full manual QA pass — nothing here has been run in a real browser.
