// src/shared/utils/emailVerification.js
//
// Single shared helper for "is this user's email actually verified right
// now?" — used by AuthContext, Login, and VerifyEmail so all three ask the
// same question the same way instead of three slightly different copies.
//
// Why this exists (not just a plain `await user.reload()`):
// A single reload() immediately after sign-in can occasionally still come
// back with `emailVerified: false` for an account that IS verified — the
// verification claim doesn't always propagate through Firebase's backend
// instantly, and if more than one part of the app reloads the same user
// object at nearly the same moment (e.g. AuthContext's global listener and
// a page's own check, both reacting to the same sign-in event), the
// responses can land in a way that leaves a stale value on the object
// after both calls settle. A lone `false` right after sign-in is therefore
// not trustworthy on its own — but a `false` that survives one short
// retry is.
//
// This does NOT replace checking after the user manually clicks
// "I've verified my email" (VerifyEmail's checkVerification) — that path
// already has a real user action giving it time to be accurate, and is
// free to just do a single reload.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reloads the given Firebase Auth user and returns whether their email is
 * verified, retrying once after a short delay if the first read says "no" —
 * this absorbs normal propagation/race delay instead of reporting a false
 * negative. Never throws for the "still not verified" case; only throws if
 * every reload attempt fails outright (e.g. genuinely offline), so callers
 * can tell "confirmed not verified" apart from "couldn't even check".
 *
 * @param {import('firebase/auth').User} user
 * @param {{ retries?: number, delayMs?: number }} [options]
 * @returns {Promise<boolean>}
 */
export async function checkEmailVerified(user, { retries = 1, delayMs = 1200 } = {}) {
  if (!user) return false;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await user.reload();
      lastError = null;

      if (user.emailVerified) return true;

      if (attempt < retries) {
        await sleep(delayMs);
      }
    } catch (error) {
      lastError = error;
      // A failed reload attempt still deserves the same short backoff
      // before giving up, in case it was just a transient hiccup.
      if (attempt < retries) {
        await sleep(delayMs);
      }
    }
  }

  if (lastError) throw lastError;
  return false;
}