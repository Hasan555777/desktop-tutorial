// public/firebase-messaging-sw.template.js

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

// ✅ Firebase Config - Build time injected
firebase.initializeApp({
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__"
});

const messaging = firebase.messaging();

// ✅ Background Message Handler (FCM)
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw] 📩 Background Message:", payload);

  const notificationTitle = payload.notification?.title || "WorkTrustbd";
  const notificationOptions = {
    body: payload.notification?.body || "You have a new notification",
    icon: "/logo192.png",
    badge: "/logo192.png",
    data: payload.data || {},
    vibrate: [100, 50, 100],
    actions: [
      {
        action: "open",
        title: "🔓 Open"
      },
      {
        action: "close",
        title: "❌ Close"
      }
    ]
  };

  self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

// ✅ Notification Click Handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  console.log("🔔 Notification clicked:", { action, data });

  if (action === "open") {
    const urlToOpen = data.url || "/";
    event.waitUntil(
      clients.openWindow(urlToOpen)
    );
  } else if (action === "close") {
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        if (clientList.length > 0) {
          clientList[0].focus();
        }
      })
    );
  } else {
    event.waitUntil(
      clients.openWindow("/")
    );
  }
});

// ✅ Service Worker Install Event
self.addEventListener("install", (event) => {
  console.log("✅ Service Worker installed");
  event.waitUntil(self.skipWaiting());
});

// ✅ Service Worker Activate Event
self.addEventListener("activate", (event) => {
  console.log("✅ Service Worker activated");
  event.waitUntil(self.clients.claim());
});