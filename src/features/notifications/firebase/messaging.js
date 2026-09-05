// src/firebase/messaging.js

import {
  getMessaging,
  getToken,
  onMessage,
  deleteToken,
  isSupported,
} from "firebase/messaging";

import { app } from "../../../shared/firebase/index";

/**
 * Firebase Messaging instance.
 *
 * IMPORTANT:
 * Do not initialize Firebase Messaging blindly during module load.
 * Some browsers/environments do not support FCM.
 */

const messaging = isSupported()
  .then((supported) => {
    if (!supported) {
      console.warn("⚠️ Firebase Messaging is not supported in this browser.");
      return null;
    }

    return getMessaging(app);
  })
  .catch((error) => {
    console.error("❌ Firebase Messaging support check failed:", error);
    return null;
  });

export {
  messaging,
  getToken,
  onMessage,
  deleteToken,
};

export default messaging;