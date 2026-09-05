// src/utils/presence.js
//
// 🔧 FIX (Inbox/Chat "always shows online" bug):
//
// ROOT CAUSE — every place in this app that displayed a user's
// online/offline dot (useUserStatus.js for the chat header,
// useUserProfiles.js for the Inbox list, components/UserStatus.jsx)
// trusted the raw `isOnline` boolean stored on users/{uid} with zero
// staleness check. That boolean is only ever set back to `false` by:
//   1. the tab's `beforeunload`/`pagehide` handler, or
//   2. the React effect's cleanup function on unmount
// (both in hooks/useOnlineStatus.js). Neither is guaranteed to run —
// browsers are explicitly allowed to skip async work in unload
// handlers, and a crashed tab/browser, a killed mobile app, a dead
// battery, or a lost network connection never fires either one at
// all. Once that happens, `isOnline: true` is stuck in Firestore
// forever and every other user sees that person as permanently
// online, even though they left the site.
//
// FIX — don't trust the boolean alone. useOnlineStatus() already
// writes a fresh `lastSeen: serverTimestamp()` heartbeat every
// ONLINE_HEARTBEAT_MS while the tab is genuinely open (see that
// file). So on the READ side, treat a user as online only if
// `isOnline === true` AND their `lastSeen` heartbeat is recent
// (within ONLINE_STALE_THRESHOLD_MS). If the heartbeat goes stale —
// which it will within seconds of the tab actually closing, crashing,
// or losing connectivity — the UI naturally falls back to "Offline"
// on its own, with no dependency on any unload event firing.
import { logger } from '../../../shared/utils/logger';

// Must match the interval useOnlineStatus() writes lastSeen on.
export const ONLINE_HEARTBEAT_MS = 30 * 1000;

// Generous buffer over the heartbeat (3x) so normal network jitter,
// a slightly delayed tick, or a briefly backgrounded tab doesn't
// falsely flip someone to "Offline" between two real heartbeats.
export const ONLINE_STALE_THRESHOLD_MS = ONLINE_HEARTBEAT_MS * 3;

const toMillis = (timestamp) => {
  if (!timestamp) return null;
  try {
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime();
    if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
    const ms = new Date(timestamp).getTime();
    return Number.isNaN(ms) ? null : ms;
  } catch (error) {
    logger.error('presence: failed to parse lastSeen timestamp', error);
    return null;
  }
};

// Returns true only if the user is flagged online AND their last
// heartbeat is recent enough to actually believe it.
export const getEffectiveOnlineStatus = (isOnlineFlag, lastSeen) => {
  if (isOnlineFlag !== true) return false;
  const lastSeenMs = toMillis(lastSeen);
  if (!lastSeenMs) return false;
  return Date.now() - lastSeenMs < ONLINE_STALE_THRESHOLD_MS;
};

export const presenceLastSeenMillis = toMillis;
