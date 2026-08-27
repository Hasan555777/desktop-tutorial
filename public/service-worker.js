// public/service-worker.js

const CACHE_VERSION = 'v1.1.0';
const CACHE_NAME = `WorkTrustbd-${CACHE_VERSION}`;

// ✅ Files to cache (সঠিক পাথ সহ)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/apple-touch-icon.png',
  // Icons
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/icons/icon-192x192-maskable.png',
  '/icons/icon-512x512-maskable.png',
  // Screenshots (ঐচ্ছিক)
  '/screenshots/home.png',
  '/screenshots/profile.png',
  '/screenshots/chat.png',
];

// ✅ Install Event - Safe with Promise.allSettled
self.addEventListener('install', (event) => {
  console.log('[SW] Install event', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[SW] Pre-caching assets');
        
        // ✅ Safe caching - individual files不会 break entire install
        const results = await Promise.allSettled(
          PRECACHE_ASSETS.map(async (asset) => {
            try {
              const response = await fetch(asset);
              if (response && response.status === 200) {
                await cache.put(asset, response);
                console.log(`[SW] ✅ Cached: ${asset}`);
              } else {
                console.warn(`[SW] ⚠️ Failed to cache: ${asset} (${response?.status})`);
              }
            } catch (error) {
              console.warn(`[SW] ⚠️ Error caching: ${asset}`, error);
            }
          })
        );
        
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`[SW] 📊 Caching complete: ${succeeded} succeeded, ${failed} failed`);
        
      } catch (error) {
        console.error('[SW] ❌ Install error:', error);
      }
      
      console.log('[SW] Skip waiting');
      return self.skipWaiting();
    })()
  );
});

// ✅ Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event', CACHE_VERSION);
  
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const results = await Promise.allSettled(
          cacheNames.map(async (cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              await caches.delete(cacheName);
              return true;
            }
            return false;
          })
        );
        
        const deleted = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
        console.log(`[SW] 🧹 Deleted ${deleted} old caches`);
        
      } catch (error) {
        console.error('[SW] ❌ Activate error:', error);
      }
      
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })()
  );
});

// ✅ Fetch Event - Improved Strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // ✅ Skip external APIs
  const skipUrls = [
    'firebase.googleapis.com',
    'securetoken.googleapis.com',
    'googleapis.com',
    'googletagmanager.com',
    'google-analytics.com',
    'cloudinary.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ];
  
  if (skipUrls.some(domain => url.hostname.includes(domain))) {
    return;
  }

  // ✅ HTML pages - Network first, offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          // Cache the successful response
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          console.log('[SW] ⚠️ Network failed, serving offline page');
          const cachedResponse = await caches.match('/offline.html');
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('/index.html');
        }
      })()
    );
    return;
  }

  // ✅ Static assets - Cache first, network fallback
  event.respondWith(
    (async () => {
      try {
        // Try cache first
        const cachedResponse = await caches.match(event.request);
        
        if (cachedResponse) {
          // ✅ Background update (stale-while-revalidate)
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, clone);
                  console.log(`[SW] 🔄 Updated cache: ${event.request.url}`);
                });
              }
            })
            .catch(() => {});
          
          return cachedResponse;
        }

        // ✅ Network fetch with cache update
        const networkResponse = await fetch(event.request);
        
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, clone);
          console.log(`[SW] 💾 Cached new asset: ${event.request.url}`);
        }
        
        return networkResponse;
        
      } catch (error) {
        console.log(`[SW] ⚠️ Fetch failed: ${event.request.url}`);
        
        // ✅ Fallback for images
        if (event.request.destination === 'image') {
          const fallback = await caches.match('/icons/icon-192x192.png');
          if (fallback) return fallback;
        }
        
        // ✅ Fallback for other assets
        if (event.request.destination === 'style' || event.request.destination === 'script') {
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
        }
        
        return new Response('Network error', { 
          status: 408, 
          statusText: 'Network error' 
        });
      }
    })()
  );
});

// ✅ Message Event - For update notification
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting');
    self.skipWaiting();
  }
  
  // ✅ For cache version check
  if (event.data && event.data.type === 'CHECK_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// ✅ Push Event - Safe with error handling
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW] 📭 Push event without data');
    return;
  }

  try {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'You have a new notification',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/',
        notificationId: data.id || Date.now(),
        timestamp: Date.now(),
      },
      actions: [
        {
          action: 'open',
          title: '📱 Open',
        },
        {
          action: 'dismiss',
          title: '✕ Dismiss',
        },
      ],
      tag: data.tag || `notification-${Date.now()}`,
      renotify: true,
    };

    event.waitUntil(
      self.registration.showNotification(
        data.title || `🔔 ${CACHE_NAME.split('-')[0]}`,
        options
      )
    );
    
    console.log('[SW] 🔔 Push notification shown');
    
  } catch (error) {
    console.error('[SW] ❌ Push notification error:', error);
  }
});

// ✅ Notification Click Event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 🔔 Notification clicked:', event.action);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    console.log('[SW] Notification dismissed');
    return;
  }

  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ 
        type: 'window', 
        includeUncontrolled: true 
      });
      
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          await client.focus();
          return;
        }
      }
      
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
        console.log(`[SW] 📂 Opened window: ${url}`);
      }
    })()
  );
});

// ✅ ✅ ✅ Periodic Cache Cleanup
setInterval(() => {
  caches.keys().then((cacheNames) => {
    cacheNames.forEach((cacheName) => {
      if (cacheName !== CACHE_NAME) {
        caches.delete(cacheName);
        console.log(`[SW] 🧹 Auto-deleted old cache: ${cacheName}`);
      }
    });
  });
}, 24 * 60 * 60 * 1000); // ✅ Every 24 hours

console.log(`[SW] ✅ Service Worker ${CACHE_VERSION} loaded`);