// block-review-worker/src/index.js
// ============================================================
// 🔒 24-HOUR BLOCK REVIEW WORKER (#27 requirement)
// ============================================================
//
// WHY THIS EXISTS:
// pages/BlockedPage.jsx used to calculate "24 hours have passed" and
// show "your account has been automatically deleted" ENTIRELY in the
// browser, from a setInterval — nothing was actually deleted, no
// admin was ever notified, and it silently did nothing if the
// blocked user never opened the app again. That's exactly what the
// requirements explicitly warn against: "Do NOT rely on the user's
// browser being open. Do NOT rely only on React timers."
//
// This is a scheduled (cron-triggered) Cloudflare Worker — the same
// pattern this project already uses for the OTP worker
// (worktrust-otp), reusing its exact JWT/service-account auth
// approach for the Firestore REST API, rather than introducing a
// different backend paradigm (e.g. Firebase Cloud Functions) into a
// project that doesn't have any.
//
// WHAT IT DOES (runs on a schedule, not tied to any user's browser):
//   1. Query users where isBanned == true
//   2. For each, check if bannedAt + 24h has passed AND a
//      block-review notification hasn't already been sent for this
//      specific block (idempotency — see blockReviewNotifiedAt below)
//   3. Create an admin_notifications document: "User X's 24-hour
//      block period has expired."
//   4. Mark that block's review-notification as sent, so re-running
//      the cron (e.g. every hour) never double-notifies for the same
//      block — but WILL notify again if the admin re-blocks the user
//      later (a fresh bannedAt naturally resets this).
//   5. Does NOT delete, unblock, or otherwise touch the user's
//      account — only notifies. The admin decides what happens next,
//      exactly as required.
//
// ⚠️ REQUIRED SECRETS (same service account as worktrust-otp — you
// can reuse the exact same credentials, just add this Worker's own
// secrets via `wrangler secret put`):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//
// ⚠️ DEPLOYMENT: I can't deploy this from this environment (no
// network access here) — see wrangler.jsonc for the cron schedule
// and README.md in this folder for setup steps. This is real,
// complete, ready-to-deploy code — just untested against your live
// Firebase project until you deploy and run it once.
// ============================================================

async function importPrivateKey(pem) {
  const normalizedPem = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  const pemContents = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(input) {
  let bytes;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claimSet));
  const signingInput = `${encodedHeader}.${encodedClaim}`;

  const privateKey = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Google token exchange failed:", data);
    throw new Error(data.error_description || data.error || "Failed to get Google access token");
  }
  return data.access_token;
}

// ── Firestore REST helpers ──

async function queryBannedUsers(env, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "users" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "isBanned" },
          op: "EQUAL",
          value: { booleanValue: true },
        },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Firestore query failed: ${JSON.stringify(err)}`);
  }

  const rows = await res.json();
  // runQuery returns an array of { document?, readTime } — rows with
  // no matching document just carry readTime, filter those out.
  return rows.filter(r => r.document).map(r => ({
    id: r.document.name.split("/").pop(),
    fields: r.document.fields || {},
  }));
}

function firestoreTimestampToMs(fieldValue) {
  if (!fieldValue?.timestampValue) return null;
  return new Date(fieldValue.timestampValue).getTime();
}

async function createAdminNotification(env, accessToken, { userId, userName, bannedAtIso }) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/admin_notifications`;
  const body = {
    fields: {
      type: { stringValue: "block_review_expired" },
      title: { stringValue: "২৪ ঘণ্টার ব্লক পর্যালোচনার সময় শেষ" },
      message: { stringValue: `User ${userName || userId}'s 24-hour block period has expired. Please review.` },
      targetUserId: { stringValue: userId },
      read: { booleanValue: false },
      createdAt: { timestampValue: new Date().toISOString() },
      relatedBlockedAt: { stringValue: bannedAtIso },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to create admin notification: ${JSON.stringify(err)}`);
  }
}

async function markUserNotified(env, accessToken, userId) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${userId}?updateMask.fieldPaths=blockReviewNotifiedAt`;
  const body = {
    fields: {
      blockReviewNotifiedAt: { timestampValue: new Date().toISOString() },
    },
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to mark user notified: ${JSON.stringify(err)}`);
  }
}

const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000;

async function runBlockReviewCheck(env) {
  const accessToken = await getGoogleAccessToken(env);
  const bannedUsers = await queryBannedUsers(env, accessToken);

  let notified = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of bannedUsers) {
    try {
      const bannedAtMs = firestoreTimestampToMs(user.fields.bannedAt);
      if (!bannedAtMs) { skipped++; continue; }

      const elapsed = Date.now() - bannedAtMs;
      if (elapsed < BLOCK_DURATION_MS) { skipped++; continue; } // not 24h yet

      // Idempotency: has THIS block already been notified? Compare
      // blockReviewNotifiedAt (if set) against bannedAt — if the
      // notification timestamp is AFTER this block started, it's
      // already been sent for this block. A later re-block (new
      // bannedAt) naturally allows a fresh notification.
      const notifiedAtMs = firestoreTimestampToMs(user.fields.blockReviewNotifiedAt);
      if (notifiedAtMs && notifiedAtMs > bannedAtMs) { skipped++; continue; }

      const userName = user.fields.displayName?.stringValue || user.fields.email?.stringValue || null;
      const bannedAtIso = user.fields.bannedAt?.timestampValue;

      await createAdminNotification(env, accessToken, { userId: user.id, userName, bannedAtIso });
      await markUserNotified(env, accessToken, user.id);
      notified++;
    } catch (err) {
      console.error(`Block review check failed for user ${user.id}:`, err);
      errors++;
    }
  }

  console.log(`Block review check complete: ${notified} notified, ${skipped} skipped, ${errors} errors (${bannedUsers.length} banned users total)`);
  return { notified, skipped, errors, total: bannedUsers.length };
}

export default {
  // Cron Trigger entry point — see wrangler.jsonc for the schedule.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBlockReviewCheck(env));
  },

  // Also expose an HTTP endpoint for manual testing / a "run now"
  // button if you ever want one — NOT required for the cron to work,
  // just convenient for verifying the Worker is configured correctly
  // without waiting for the schedule.
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST to manually trigger a block-review check.", { status: 405 });
    }
    try {
      const result = await runBlockReviewCheck(env);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Manual trigger failed:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
