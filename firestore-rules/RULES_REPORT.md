# Firestore & Storage Rules — Report

## Files
- `firestore.rules` — Firestore security rules, built collection-by-collection from what's actually in the codebase.
- `storage.rules` — closes Firebase Storage entirely (see file for why — you're not actually using it for uploads; Cloudinary is).

No rules file existed anywhere in this project before now. Whatever has been protecting your data lived only in the Firebase Console, invisible to this codebase. **Review this in the Firebase Console's Rules Playground before deploying** — I can't deploy or test these from here, so treat this as a well-reasoned first draft, not a verified-working replacement.

## Collections covered
`users`, `wallets`, `identityRecords`, `posts`, `deals`, `chats` + `messages` subcollection, `transactions`, `temp_transactions`, `withdrawals`, `reviews`, `reports`, `disputes`, `notifications`, `admin_notifications`, `adminLogs`, `announcements`, `announcementHistory`, `login_history`. Everything else defaults to fully closed.

## The most important line in the file
`users/{userId}`'s update rule blocks anyone except an admin from changing their own `role` field. Without this, any user could set `role: 'admin'` on themselves via a direct Firestore write and bypass every `isAdmin()` check in your entire app — this is the single most critical thing this file protects against.

## Three things that need your decision, not mine

**1. Wallet balance increases from non-admin writes are blocked.** Your escrow-release-to-seller flow (`hooks/dealManager.hooks.js`) currently runs client-side and needs the seller's balance to increase when a buyer confirms deal completion. My rule can't safely distinguish "legitimate escrow release" from "user manufacturing balance" using only that document's own data — that distinction depends on the *deal's* state, a different document. Real options:
   - Move just that one operation (release escrow to seller on confirmed completion) into a Cloud Function — the actually-correct fix, and not a large function to write once you're set up to deploy one.
   - Or relax the rule to allow it, accepting more client trust than I'd recommend for money.
   I left the strict version in place since weakening it silently would be the wrong call to make without you.

**2. `identityRecords` needs to be partially readable by any signed-in user** so the client-side duplicate-ID check (`utils/identityUtils.js`) can query by `identityHash`. That means, in principle, an authenticated user could query and see other people's `identityHash`/`fullName`/`identityType` (not the actual document images — those are Cloudinary URLs, not exposed by this query). The real fix is moving that duplicate check into a Cloud Function so regular users never need read access to this collection at all. Flagging rather than quietly accepting the exposure.

**3. Your `rules/index.js` business-rule engine has zero actual logic** — every rule (`withdrawRules`, `moneyLockRules`, `dealCancelRules`, `emailChangeRules`, etc.) is an empty object with a comment listing unanswered questions: minimum/maximum withdrawal amounts, how many times email can be changed, whether deal cancellation has a penalty, and so on. These are business policy decisions, not something I can infer from the code — I didn't want to invent numbers and call them your rules. Firestore security rules (who can write what) are the layer I could actually build here; give me the actual policy answers for any of these and I'll write real enforcement code for them.

## Keep two things in sync by hand
`isAdminEmail()` in the rules hardcodes the same two emails as `constants/admin.js` / `VITE_ADMIN_EMAILS`. If you add or remove an admin, update **both** places — this exact kind of drift (one place checking a role field, another checking an email list, falling out of sync) was the root cause of the emergency-unlock bug fixed earlier in this audit. Migrating to Firebase custom claims for admin status would remove this duplication permanently, since claims live in the auth token itself rather than being checked two different ways in two different places — worth considering when you have time.

## Addendum: messages subcollection rule updated
Once chat message editing/deletion got implemented (soft-delete, 15-minute edit window), the `chats/{chatId}/messages/{messageId}` rule was updated to match: regular users can never hard-delete a message now (only admins can), and updates are only allowed in two specific shapes — a soft-delete (only `deleted`/`deletedAt`/`deletedBy` plus the redaction fields change) or an edit within 15 minutes of the message's `createdAt` (only `text`/`edited`/`editedAt` change). This is enforced server-side now, not just in the app code, since a client-side-only check can be bypassed by calling Firestore directly.

**Known gap not yet closed:** the `chats/{chatId}` document rule still allows any participant to update any field on the shared chat doc, including `unreadCount` — meaning a participant could technically clear the *other* person's unread badge or manipulate their own. This existed before this audit and wasn't in scope to fix here, but worth knowing since it directly touches something we just built (mark-as-read).

## Addendum 2: messageAudit collection added
Soft-deleting a message now also redacts its content (`text`/`imageUrl`/`documentUrl`/`audioUrl` set to `null`) so deleted content stops being delivered to every participant's client entirely — before this, the UI just chose not to render it, but the raw content was still syncing down via the normal listener (visible in devtools). The original content is preserved in a new `messageAudit` collection, admin-read-only, for dispute/moderation review — matching the "prefer soft-delete/audit-preservation architecture" requirement for a platform where chats can be evidence in deal disputes.

**Known minor gap:** deleting the *most recent* message in a chat doesn't update the chat document's `lastMessage` preview field (shown in the Inbox list) — it'll keep showing the old text until a new message is sent. Not a security issue (that field was always just a snapshot string), just a small UX inconsistency not fixed in this pass.

## Addendum 3: admin RBAC (roles/permissions) added
Added a granular permission system rather than fixed named roles (FINANCE_ADMIN etc.) — inspecting the actual admin handlers in the codebase surfaced these real responsibility clusters: `users`, `verification`, `finance`, `moderation`, `announcements`. The two existing `ADMIN_EMAILS` accounts remain permanent "main admins" with full access and are the only accounts that can create/manage other admins; anyone else with `role === 'admin'` is a sub-admin gated by their `adminPermissions` map.

**The critical rule change:** `users/{userId}`'s update rule now protects `adminPermissions` the exact same way it already protected `role` — neither can be changed by the document owner or by a regular admin, only by a main admin. Without this, a sub-admin (or any user) could grant themselves permissions via a direct Firestore write, identical in spirit to the role-escalation bug this file already guarded against.

**Update — this gap is now substantially closed:** the sensitive actions (deposit/withdrawal approval, wallet balance changes, editing another user's profile) now require the specific permission at both layers:
- **Client-side**: `AdminDashboard.jsx`'s finance/user-management handlers are wrapped with a `requirePermission()` check at the point of the action itself, not just hidden navigation — a sub-admin without `finance` gets an explicit error if they somehow trigger the action.
- **Server-side (the real boundary)**: `withdrawals`, `transactions`, and `wallets` update rules now require `hasPermission('finance')` instead of broad `isAdmin()`. A sub-admin editing *another* user's document (blocking them, changing verification status) now needs `users` or `verification` permission — this used to be open to any admin regardless of granted permissions.

**Update — closed properly, not restructured around.** The `users/{userId}` rule now checks the *specific fields* being changed, not just "does this admin have any relevant permission." Built by reading every actual `updateDoc()` call in `useAdminData.js` that touches another user's document — not guessed field names. A sub-admin with only `verification` permission can no longer change ban-related fields, and vice versa; changing fields from both groups in one write requires both permissions. `updatedAt` is treated as shared bookkeeping in both groups so it never blocks a legitimate write.

One thing worth knowing: this couldn't be run against a real Firestore instance to confirm the field lists are 100% exhaustive — if a future admin function starts writing a new field to another user's document that isn't in either list, that specific write would need `hasPermission('users') && hasPermission('verification')` (both) rather than just the one that's actually relevant, until the rule is updated to include it. Not a security hole (it fails toward *more* restrictive, not less), just a maintenance note.
