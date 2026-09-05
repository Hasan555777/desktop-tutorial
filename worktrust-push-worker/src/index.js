// worktrust-push-worker\src\index.js
// ============================================================
// 📲 PUSH WORKER — sends real FCM pushes (item #8 follow-up)
// ============================================================
//
// WHY THIS EXISTS:
// notificationHelper.js's sendPushNotification() used to POST to
// '/api/send-push-notification' — a backend route that never
// existed anywhere in this project. That's the reason a closed
// tab / backgrounded app never got a real system notification: the
// Firestore notification document got created fine (that's what
// powers the in-app bell), but nothing ever told FCM to actually
// deliver a push to the device.
//
// The "proper" fix is normally a Cloud Function triggered on
// Firestore writes — but Cloud Functions require the Blaze
// (pay-as-you-go) plan just to deploy, regardless of how little
// they're actually used. This Worker does the same job — call
// FCM's HTTP v1 send API — without needing Blaze at all:
//   - Cloudflare Workers' free plan (100,000 requests/day) is enough
//   - FCM itself is free and unlimited on Firebase's free Spark plan
//   - The only thing "Blaze" gates here is deploying a *Cloud
//     Function* — calling FCM's REST API directly, from anywhere
//     (including this Worker), needs no billing plan at all.
//
// This reuses the exact JWT-signing approach already proven in
// worktrust-otp-worker/src/index.js (Web Crypto RS256, no Node.js
// / no firebase-admin needed — Cloudflare Workers can't run
// firebase-admin since it's Node-only).
//
// ⚠️ REQUIRED SECRETS (set with `wrangler secret put <NAME>`):
//   FIREBASE_PROJECT_ID     — same value as the OTP worker
//   FIREBASE_CLIENT_EMAIL   — same service account as the OTP worker
//                             works, AS LONG AS it has the
//                             "Firebase Cloud Messaging API Admin"
//                             IAM role too (Google Cloud Console →
//                             IAM → find the service account → Edit
//                             → Add Role). If you get a 403 from FCM
//                             below, this role is almost always why.
//   FIREBASE_PRIVATE_KEY    — same service account's private key
//   PUSH_SHARED_SECRET      — any random string you make up. The
//                             client sends this back in an
//                             X-Push-Secret header. This is NOT
//                             Firebase auth — it's just a basic
//                             "only our own app can call this"
//                             check, since FCM tokens themselves
//                             aren't secret and CORS alone doesn't
//                             stop server-to-server/curl calls.
//
// ⚠️ REQUIRED KV NAMESPACE (bind in wrangler.jsonc, see that file):
//   PUSH_STORE — used only for per-IP rate limiting, same pattern
//                as OTP_STORE in the OTP worker.
//
// ⚠️ SET THIS AFTER DEPLOYING:
//   VITE_PUSH_API_URL (in your frontend .env / production env vars)
//   = the URL this Worker deploys to, e.g.
//   https://worktrust-push.<your-subdomain>.workers.dev
//   (notificationHelper.js reads this — see the fix there.)
// ============================================================

const ALLOWED_ORIGINS = [
  "https://worktrustbd.com",
  "https://www.worktrustbd.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
];

const corsHeaders = (request) => {
  const origin = request.headers.get("Origin");

  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Push-Secret",
      "Access-Control-Max-Age": "86400",
    };
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Push-Secret",
    "Access-Control-Max-Age": "86400",
  };
};

// ============================================================
// Main Handler
// ============================================================
export default {
  async fetch(request, env) {
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method === "GET") {
      // Same "hit the URL in a browser to sanity-check secrets"
      // pattern as the OTP worker — nothing sensitive is exposed.
      return jsonResponse({
        success: true,
        service: "WorkTrustBD Push Worker",
        status: "online",
        timestamp: new Date().toISOString(),
        environment: env.ENVIRONMENT || "development",
        secretsConfigured: {
          FIREBASE_PROJECT_ID: !!env.FIREBASE_PROJECT_ID,
          FIREBASE_CLIENT_EMAIL: !!env.FIREBASE_CLIENT_EMAIL,
          FIREBASE_PRIVATE_KEY: !!env.FIREBASE_PRIVATE_KEY,
          PUSH_SHARED_SECRET: !!env.PUSH_SHARED_SECRET,
        },
        kvBound: !!env.PUSH_STORE,
      }, 200, headers);
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { success: false, message: "Only POST requests are allowed." },
        405,
        headers
      );
    }

    const url = new URL(request.url);
    if (url.pathname !== "/send") {
      return jsonResponse(
        { success: false, message: "Endpoint not found." },
        404,
        headers
      );
    }

    return await sendPush(request, env, headers);
  },
};

// ============================================================
// SEND PUSH
// ============================================================
async function sendPush(request, env, headers) {
  try {
    // ── App-level auth (see PUSH_SHARED_SECRET note above) ──
    const providedSecret = request.headers.get("X-Push-Secret");
    if (!env.PUSH_SHARED_SECRET || providedSecret !== env.PUSH_SHARED_SECRET) {
      return jsonResponse(
        { success: false, message: "Unauthorized." },
        401,
        headers
      );
    }

    const clientIP = request.headers.get("CF-Connecting-IP") ||
                     request.headers.get("X-Forwarded-For") ||
                     "unknown";

    // ── Basic per-IP rate limit (mirrors OTP worker's pattern) ──
    // Generous on purpose — a busy chat/wallet page can legitimately
    // fire several notifications a minute. This is here to stop
    // abuse, not to throttle normal use.
    if (env.PUSH_STORE) {
      const ipKey = `ratelimit:ip:${clientIP}`;
      const ipAttempts = await env.PUSH_STORE.get(ipKey);
      const ipCount = ipAttempts ? parseInt(ipAttempts) : 0;

      if (ipCount >= 60) {
        return jsonResponse(
          { success: false, message: "Too many requests from this IP. Please try again later." },
          429,
          headers
        );
      }
      await env.PUSH_STORE.put(ipKey, String(ipCount + 1), { expirationTtl: 60 });
    }

    const body = await request.json();
    const { token, title, message, data, link } = body;

    if (!token || !title || !message) {
      return jsonResponse(
        { success: false, message: "token, title and message are required." },
        400,
        headers
      );
    }

    const accessToken = await getGoogleAccessToken(env, [
      "https://www.googleapis.com/auth/firebase.messaging",
    ]);

    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;

    // FCM's data payload only accepts string values — stringify
    // anything that comes in so a caller passing a number/bool
    // doesn't cause a confusing 400 from Google's side.
    const stringData = {};
    if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          stringData[key] = String(value);
        }
      }
    }

    const fcmRes = await fetch(fcmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body: message },
          data: stringData,
          webpush: {
            fcm_options: { link: link || "/" },
            notification: {
              icon: "/icons/icon-192.png",
            },
          },
        },
      }),
    });

    const fcmData = await fcmRes.json();

    if (!fcmRes.ok) {
      console.error("FCM send failed:", fcmData);

      // UNREGISTERED / NOT_FOUND means the token is dead (uninstalled
      // app, cleared site data, expired token, etc.) — no point
      // treating that as a transient error worth retrying. Report it
      // distinctly so the caller can decide whether to clear the
      // stale token from Firestore.
      const errorCode = fcmData?.error?.details?.find(
        (d) => d["@type"]?.includes("FcmError")
      )?.errorCode;

      return jsonResponse(
        {
          success: false,
          message: fcmData?.error?.message || "FCM send failed.",
          staleToken: errorCode === "UNREGISTERED" || fcmRes.status === 404,
        },
        fcmRes.status,
        headers
      );
    }

    return jsonResponse(
      { success: true, name: fcmData.name },
      200,
      headers
    );
  } catch (error) {
    console.error("Push Worker Error:", error);
    return jsonResponse(
      { success: false, message: "Internal server error." },
      500,
      headers
    );
  }
}

// ============================================================
// GOOGLE OAUTH2 ACCESS TOKEN (Web Crypto RS256 JWT)
// — identical approach to worktrust-otp-worker/src/index.js,
//   duplicated here on purpose: each Worker is deployed and scoped
//   independently, and this keeps the push worker deployable/
//   readable on its own without depending on another Worker's code.
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

async function getGoogleAccessToken(env, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: scopes.join(" "),
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

// ============================================================
// JSON RESPONSE
// ============================================================
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}