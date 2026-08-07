/* public/firebase-messaging-sw.js */

importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js');

// ✅ Firebase Config
firebase.initializeApp({
  apiKey: "AIzaSyDE17xmN1l4kD-DPuNx3ls22I4T5prcWkc",
  authDomain: "upwork-clone-56910.firebaseapp.com",
  projectId: "upwork-clone-56910",
  storageBucket: "upwork-clone-56910.firebasestorage.app",
  messagingSenderId: "564891254913",
  appId: "1:564891254913:web:7b819cacf9b3269ead0d80"
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
    // ✅ requireInteraction সরানো হয়েছে (সব browser support করে না)
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

// ❌ Push Event REMOVED - Duplicate notification prevent করার জন্য
// শুধু FCM onBackgroundMessage ব্যবহার করুন