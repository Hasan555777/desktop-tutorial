//worktrust-otp\src\index.js
// ============================================================
// 🔒 SECURE OTP WORKER - SMS.NET.BD Integrated
// + Phone-OTP password reset (Firebase Identity Toolkit REST API)
// ============================================================
//
// ⚠️ REQUIRED SECRETS (set with `wrangler secret put <NAME>`):
//   FIREBASE_PROJECT_ID     — your Firebase project ID
//   FIREBASE_CLIENT_EMAIL   — service account "client_email"
//   FIREBASE_PRIVATE_KEY    — service account "private_key" (the full
//                             PEM string, including the
//                             -----BEGIN/END PRIVATE KEY----- lines)
//
// 🔧 THIS REVISION (search "FIX" to jump to each spot):
// 1. FIX: OAuth2 scope for the service-account token broadened from
//    the two narrow scopes (identitytoolkit + datastore) to
//    "https://www.googleapis.com/auth/cloud-platform". Settings-page
//    password change (client SDK) was working fine, but OTP-based
//    reset silently failed to actually change the password — the
//    most likely explanation is the narrow "identitytoolkit" scope
//    not being sufficient for the accounts:update admin call even
//    though the SERVICE ACCOUNT's IAM role is correct: with the old
//    scope, getGoogleAccessToken() still SUCCEEDS (so no error is
//    thrown there), but the later accounts:update call gets rejected
//    at Google's end — a failure mode that's invisible without
//    reading Worker logs. cloud-platform is the broadest, most
//    commonly-recommended scope for this exact kind of admin REST
//    call and removes scope-mismatch as a possible cause entirely.
// 2. FIX: resetPassword() now includes the ACTUAL Google API error
//    text in the JSON response when env.ENVIRONMENT !== "production"
//    (as a `debugError` field) — so you can see precisely which
//    stage failed and why directly in the browser, without needing
//    `wrangler tail` access. This only exposes internals outside
//    production.
// 3. (earlier) importPrivateKey() also handles PEM keys whose
//    newlines got turned into literal "\n" instead of real line
//    breaks — extremely common when a multi-line PEM is pasted into
//    a single-line secret value.
// 4. (earlier) each external call in resetPassword() has its own
//    try/catch with a distinct console.error prefix.
//
// The service account needs a role that can update Firebase Auth users
// and read Firestore — "Firebase Authentication Admin" +
// "Cloud Datastore User" covers it, PLUS (if you still see permission
// errors after this fix) also try adding "Service Usage Consumer" —
// some projects require it for the calling API to be billed/quota'd
// correctly under the service account's own credentials.
//
// WHY REST instead of firebase-admin: Cloudflare Workers don't run
// Node.js, so the firebase-admin npm package can't run here. This talks
// to Google's REST APIs directly, authenticating with a JWT signed via
// the Workers-native Web Crypto API — no Node-only dependencies.
// ============================================================

// ============================================================
// CORS Headers (Properly Reject Unknown Origins)
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      return jsonResponse({
        success: true,
        service: "WorkTrustBD OTP Worker",
        status: "online",
        timestamp: new Date().toISOString(),
        environment: env.ENVIRONMENT || "development",
        clientIP: request.headers.get("CF-Connecting-IP") || "unknown",
        // Quick sanity check without exposing secret values — confirms
        // the 3 Firebase secrets are actually set just by hitting the
        // Worker URL in a browser. If any of these is false, that IS
        // your bug — go set the missing secret with `wrangler secret put`.
        firebaseSecretsConfigured: {
          FIREBASE_PROJECT_ID: !!env.FIREBASE_PROJECT_ID,
          FIREBASE_CLIENT_EMAIL: !!env.FIREBASE_CLIENT_EMAIL,
          FIREBASE_PRIVATE_KEY: !!env.FIREBASE_PRIVATE_KEY,
        },
      }, 200, headers);
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { success: false, message: "Only POST requests are allowed." },
        405,
        headers
      );
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      const clientIP = request.headers.get("CF-Connecting-IP") ||
                       request.headers.get("X-Forwarded-For") ||
                       "unknown";

      if (path === "/send-otp") {
        return await sendOtp(request, env, clientIP, headers);
      }

      if (path === "/verify-otp") {
        return await verifyOtp(request, env, clientIP, headers);
      }

      if (path === "/reset-password") {
        return await resetPassword(request, env, clientIP, headers);
      }

      return jsonResponse(
        { success: false, message: "Endpoint not found." },
        404,
        headers
      );
    } catch (error) {
      console.error("OTP Worker Error:", error);
      return jsonResponse(
        { success: false, message: "Internal server error." },
        500,
        headers
      );
    }
  },
};

// ============================================================
// SEND OTP - With Security Layers (unchanged)
// ============================================================
async function sendOtp(request, env, clientIP, headers) {
  try {
    const body = await request.json();
    const phone = normalizePhone(body.phone);

    if (!phone) {
      return jsonResponse(
        { success: false, message: "Valid Bangladesh phone number is required." },
        400,
        headers
      );
    }

    const ipKey = `ratelimit:ip:${clientIP}`;
    const ipAttempts = await env.OTP_STORE.get(ipKey);
    const ipCount = ipAttempts ? parseInt(ipAttempts) : 0;

    if (ipCount >= 10) {
      return jsonResponse(
        { success: false, message: "Too many requests from this IP. Please try again later." },
        429,
        headers
      );
    }

    const cooldownKey = `cooldown:${phone}`;
    const cooldownExists = await env.OTP_STORE.get(cooldownKey);

    if (cooldownExists) {
      return jsonResponse(
        { success: false, message: "Please wait 60 seconds before requesting a new OTP." },
        429,
        headers
      );
    }

    const dailyKey = `daily:${phone}`;
    const dailyAttempts = await env.OTP_STORE.get(dailyKey);
    const dailyCount = dailyAttempts ? parseInt(dailyAttempts) : 0;

    if (dailyCount >= 5) {
      return jsonResponse(
        { success: false, message: "Maximum OTP requests reached for today. Please try again tomorrow." },
        429,
        headers
      );
    }

    const otp = generateOtp();
    const expiresInSeconds = 5 * 60;

    await env.OTP_STORE.put(`otp:${phone}`, otp, { expirationTtl: expiresInSeconds });
    await env.OTP_STORE.put(`attempts:${phone}`, "0", { expirationTtl: 300 });
    await env.OTP_STORE.put(cooldownKey, "1", { expirationTtl: 60 });
    await env.OTP_STORE.put(dailyKey, String(dailyCount + 1), { expirationTtl: 86400 });
    await env.OTP_STORE.put(ipKey, String(ipCount + 1), { expirationTtl: 3600 });

    const isProduction = env.ENVIRONMENT === "production";
    let smsSent = false;
    let smsError = null;

    console.log("🔐 API key loaded:", !!env.SMS_API_KEY);
    console.log("🔐 API key length:", env.SMS_API_KEY?.length || 0);

    if (isProduction && env.SMS_API_KEY) {
      try {
        const smsResult = await sendSms(phone, otp, env.SMS_API_KEY);
        smsSent = smsResult.success || false;
        if (!smsSent) {
          smsError = smsResult.message || "SMS sending failed";
        }
        console.log(`📱 SMS result for ${phone}:`, smsResult);
      } catch (error) {
        smsError = error.message;
        console.error(`❌ SMS failed for ${phone}:`, error);
      }
    }

    if (isProduction && !smsSent) {
      await env.OTP_STORE.delete(`otp:${phone}`);
      await env.OTP_STORE.delete(`attempts:${phone}`);
      await env.OTP_STORE.delete(cooldownKey);

      return jsonResponse(
        { success: false, message: smsError || "Failed to send SMS. Please try again." },
        500,
        headers
      );
    }

    const response = {
      success: true,
      message: isProduction ? "OTP sent successfully." : "OTP generated successfully.",
      expiresIn: expiresInSeconds,
    };

    if (!isProduction) {
      response.development = true;
      response.otp = otp;
      response.smsSent = smsSent;
    }

    return jsonResponse(response, 200, headers);

  } catch (error) {
    console.error("Send OTP Error:", error);
    return jsonResponse(
      { success: false, message: "Failed to send OTP. Please try again." },
      500,
      headers
    );
  }
}

// ============================================================
// VERIFY OTP — issues a short-lived, single-use reset token
// ============================================================
async function verifyOtp(request, env, clientIP, headers) {
  try {
    const body = await request.json();
    const phone = normalizePhone(body.phone);
    const submittedOtp = String(body.otp || "").trim();

    if (!phone || !/^\d{6}$/.test(submittedOtp)) {
      return jsonResponse(
        { success: false, message: "Phone number and 6-digit OTP are required." },
        400,
        headers
      );
    }

    const attemptsKey = `attempts:${phone}`;
    const attempts = await env.OTP_STORE.get(attemptsKey);
    const attemptCount = attempts ? parseInt(attempts) : 0;

    if (attemptCount >= 5) {
      await env.OTP_STORE.delete(`otp:${phone}`);
      return jsonResponse(
        { success: false, message: "Too many failed attempts. Please request a new OTP." },
        429,
        headers
      );
    }

    const storedOtp = await env.OTP_STORE.get(`otp:${phone}`);

    if (!storedOtp) {
      return jsonResponse(
        { success: false, message: "OTP is invalid or expired. Please request a new one." },
        400,
        headers
      );
    }

    if (storedOtp !== submittedOtp) {
      await env.OTP_STORE.put(attemptsKey, String(attemptCount + 1), { expirationTtl: 300 });
      const remainingAttempts = 5 - (attemptCount + 1);
      return jsonResponse(
        { success: false, message: `Incorrect OTP. ${remainingAttempts} attempts remaining.` },
        400,
        headers
      );
    }

    // ✅ OTP correct → cleanup
    await env.OTP_STORE.delete(`otp:${phone}`);
    await env.OTP_STORE.delete(attemptsKey);
    // ⚠️ DO NOT delete cooldown - keeps 60s cooldown active

    const resetToken = generateResetToken();
    await env.OTP_STORE.put(`resettoken:${resetToken}`, phone, { expirationTtl: 600 });

    return jsonResponse({
      success: true,
      verified: true,
      resetToken,
      message: "OTP verified successfully.",
    }, 200, headers);

  } catch (error) {
    console.error("Verify OTP Error:", error);
    return jsonResponse(
      { success: false, message: "Failed to verify OTP. Please try again." },
      500,
      headers
    );
  }
}

// ============================================================
// RESET PASSWORD
//
// 🔧 FIX #2: on failure, the response now includes the real Google
// API error text as `debugError` when NOT running in production —
// lets you see exactly what broke straight from the browser.
// ============================================================
async function resetPassword(request, env, clientIP, headers) {
  const isProduction = env.ENVIRONMENT === "production";

  try {
    const body = await request.json();
    const phone = normalizePhone(body.phone);
    const token = String(body.token || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!phone || !token) {
      return jsonResponse(
        { success: false, message: "Phone number and reset token are required." },
        400,
        headers
      );
    }
    if (newPassword.length < 6) {
      return jsonResponse(
        { success: false, message: "Password must be at least 6 characters." },
        400,
        headers
      );
    }

    const ipKey = `ratelimit:reset:${clientIP}`;
    const ipAttempts = await env.OTP_STORE.get(ipKey);
    const ipCount = ipAttempts ? parseInt(ipAttempts) : 0;
    if (ipCount >= 10) {
      return jsonResponse(
        { success: false, message: "Too many requests. Please try again later." },
        429,
        headers
      );
    }
    await env.OTP_STORE.put(ipKey, String(ipCount + 1), { expirationTtl: 3600 });

    const tokenKey = `resettoken:${token}`;
    const storedPhone = await env.OTP_STORE.get(tokenKey);
    if (!storedPhone || storedPhone !== phone) {
      return jsonResponse(
        { success: false, message: "Reset token is invalid or expired. Please verify OTP again." },
        400,
        headers
      );
    }

    // Consume immediately — single use, regardless of what happens next
    await env.OTP_STORE.delete(tokenKey);

    if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
      console.error("❌ [reset-password] Firebase Admin secrets not configured on this Worker. Run `wrangler secret list` to check.");
      return jsonResponse(
        {
          success: false,
          message: "Server misconfigured. Please contact support.",
          ...(isProduction ? {} : { debugError: "One or more of FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY is not set on this Worker." }),
        },
        500,
        headers
      );
    }

    // ── Stage 1: Google OAuth2 token exchange ──
    // 🔧 FIX #1: broadened from ["identitytoolkit", "datastore"] to the
    // single "cloud-platform" scope — the most reliable/permissive
    // scope for this kind of admin REST call, removes any narrow-scope
    // permission mismatch as a possible cause of a silent failure.
    let accessToken;
    try {
      accessToken = await getGoogleAccessToken(env, [
        "https://www.googleapis.com/auth/cloud-platform",
      ]);
    } catch (err) {
      console.error("❌ [reset-password] Google token exchange failed:", err.message);
      console.error("   → This usually means FIREBASE_PRIVATE_KEY or FIREBASE_CLIENT_EMAIL is wrong/malformed, or the service account JSON key was revoked.");
      return jsonResponse(
        {
          success: false,
          message: "Server configuration error (auth). Please contact support.",
          ...(isProduction ? {} : { debugError: `[token-exchange] ${err.message}` }),
        },
        500,
        headers
      );
    }

    // ── Stage 2: Firestore lookup by phone ──
    // Firestore stores the user's phone in LOCAL format (e.g.
    // "01712345678"), while `phone` here is the international format
    // (e.g. "8801712345678") used for SMS — convert back before querying.
    const localPhone = "0" + phone.substring(3);
    let uid;
    try {
      uid = await findUserUidByPhone(env, accessToken, localPhone);
    } catch (err) {
      console.error("❌ [reset-password] Firestore lookup failed:", err.message);
      console.error("   → Check the service account has the 'Cloud Datastore User' IAM role on this Firebase project.");
      return jsonResponse(
        {
          success: false,
          message: "Server configuration error (lookup). Please contact support.",
          ...(isProduction ? {} : { debugError: `[firestore-lookup] ${err.message}` }),
        },
        500,
        headers
      );
    }

    if (!uid) {
      return jsonResponse(
        {
          success: false,
          message: "No account found for this phone number.",
          ...(isProduction ? {} : { debugError: `[firestore-lookup] No users/* document has phone == "${localPhone}"` }),
        },
        404,
        headers
      );
    }

    // ── Stage 3: Identity Toolkit password update ──
    try {
      await updateFirebasePassword(env, accessToken, uid, newPassword);
    } catch (err) {
      console.error("❌ [reset-password] Password update failed:", err.message);
      console.error("   → Check the service account has the 'Firebase Authentication Admin' IAM role on this Firebase project.");
      return jsonResponse(
        {
          success: false,
          message: "Failed to update password. Please contact support.",
          ...(isProduction ? {} : { debugError: `[identity-toolkit-update] uid=${uid} — ${err.message}` }),
        },
        500,
        headers
      );
    }

    return jsonResponse(
      { success: true, message: "Password updated successfully." },
      200,
      headers
    );

  } catch (error) {
    console.error("❌ [reset-password] Unexpected error:", error);
    return jsonResponse(
      {
        success: false,
        message: "Failed to reset password. Please try again.",
        ...(isProduction ? {} : { debugError: `[unexpected] ${error.message}` }),
      },
      500,
      headers
    );
  }
}

// ============================================================
// 📱 SEND SMS via SMS.NET.BD (unchanged)
// ============================================================
async function sendSms(phone, otp, apiKey) {
  const apiUrl = "https://api.sms.net.bd/sendsms";
  const message = `WorkTrustBD verification code: ${otp}
This code is valid for 5 minutes.
Do not share this code with anyone.`;

  const formData = new URLSearchParams();
  formData.append("api_key", apiKey);
  formData.append("msg", message);
  formData.append("to", phone);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const text = await response.text();
    console.log("📱 SMS.NET.BD Response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, message: "Invalid response from SMS provider" };
    }

    if (data.error === 0) {
      return {
        success: true,
        message: data.msg || "SMS sent successfully",
        requestId: data.data?.request_id || null,
      };
    }

    return { success: false, message: data.msg || `SMS provider error: ${data.error}` };

  } catch (error) {
    console.error("❌ SMS.NET.BD Error:", error);
    return { success: false, message: error.message || "SMS API request failed" };
  }
}

// ============================================================
// ✅ Google service-account auth (Web Crypto, no Node deps)
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

async function findUserUidByPhone(env, accessToken, localPhone) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "users" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "phone" },
          op: "EQUAL",
          value: { stringValue: localPhone },
        },
      },
      limit: 1,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Firestore query failed:", data);
    throw new Error(data.error?.message || "Failed to look up account.");
  }

  const match = Array.isArray(data) ? data.find((r) => r.document) : null;
  if (!match) return null;

  return match.document.name.split("/").pop();
}

async function updateFirebasePassword(env, accessToken, uid, newPassword) {
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:update`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ localId: uid, password: newPassword }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Identity Toolkit update failed:", data);
    throw new Error(data.error?.message || "Failed to update password.");
  }
  return data;
}

// ============================================================
// GENERATE OTP (Web Crypto)
// ============================================================
function generateOtp() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const otp = (array[0] % 900000) + 100000;
  return otp.toString();
}

// ============================================================
// GENERATE RESET TOKEN (Web Crypto, 32 random bytes → hex)
// ============================================================
function generateResetToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// NORMALIZE BANGLADESH PHONE NUMBER (unchanged)
// ============================================================
function normalizePhone(phone) {
  if (!phone) return null;

  let value = String(phone).trim();
  value = value.replace(/[\s-]/g, "");

  if (/^01\d{9}$/.test(value)) {
    return "880" + value.substring(1);
  }
  if (/^\+8801\d{9}$/.test(value)) {
    return value.substring(1);
  }
  if (/^8801\d{9}$/.test(value)) {
    return value;
  }

  return null;
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