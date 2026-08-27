// public/firebase-messaging-sw.template.js

importScripts(
  "https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js"
);

// ============================================================
// Firebase Configuration
// Build-time placeholders are replaced during production build.
// ============================================================

firebase.initializeApp({
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
});

const messaging = firebase.messaging();

// ============================================================
// Background FCM Message Handler
// ============================================================

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw] 📩 Background Message:",
    payload
  );

  const notificationTitle =
    payload.notification?.title ||
    payload.data?.title ||
    "WorkTrustbd";

  const notificationOptions = {
    body:
      payload.notification?.body ||
      payload.data?.body ||
      "You have a new notification",

    // Use the same icon location as the PWA manifest.
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",

    data: {
      ...(payload.data || {}),
      url: payload.data?.url || payload.fcmOptions?.link || "/",
    },

    vibrate: [100, 50, 100],

    actions: [
      {
        action: "open",
        title: "🔓 Open",
      },
      {
        action: "close",
        title: "❌ Close",
      },
    ],
  };

  return self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

// ============================================================
// Notification Click Handler
// ============================================================

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  console.log(
    "🔔 Notification clicked:",
    {
      action,
      data,
    }
  );

  // ----------------------------------------------------------
  // Explicit Close action
  // ----------------------------------------------------------

  if (action === "close") {
    return;
  }

  // ----------------------------------------------------------
  // Determine destination
  // ----------------------------------------------------------

  const targetUrl = data.url || "/";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // Try to reuse an existing WorkTrustbd tab.
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus().then(() => {
              if ("navigate" in client) {
                return client.navigate(targetUrl);
              }

              return client;
            });
          }
        }

        // No existing tab → open a new one.
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return undefined;
      })
      .catch((error) => {
        console.error(
          "[firebase-messaging-sw] ❌ Notification click error:",
          error
        );

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return undefined;
      })
  );
});

// ============================================================
// Service Worker Install
// ============================================================

self.addEventListener("install", (event) => {
  console.log(
    "[firebase-messaging-sw] ✅ Service Worker installed"
  );

  event.waitUntil(self.skipWaiting());
});

// ============================================================
// Service Worker Activate
// ============================================================

self.addEventListener("activate", (event) => {
  console.log(
    "[firebase-messaging-sw] ✅ Service Worker activated"
  );

  event.waitUntil(self.clients.claim());
});