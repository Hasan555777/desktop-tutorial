import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'favicon.ico',
        'robots.txt',
        'apple-touch-icon.png',
        'icons/*.png'
      ],
      manifest: {
        id: '/',
        scope: '/',
        name: 'WorkTrustbd - Trusted Marketplace',
        short_name: 'WorkTrustbd',
        description: 'Trusted marketplace for hiring freelancers and selling services in Bangladesh',
        theme_color: '#14b8a6',
        background_color: '#090d16',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait',
        start_url: '/?source=pwa',
        categories: ['business', 'productivity', 'utilities'],
        lang: 'bn',
        dir: 'ltr',
        launch_handler: {
          client_mode: 'focus-existing'
        },
        share_target: {
          action: '/share-target',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        },
        icons: [
          {
            src: '/icons/icon-72x72.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-96x96.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-128x128.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-144x144.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-152x152.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-384x384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-192x192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [
          {
            src: '/screenshots/home.png',
            sizes: '1280x720',
            type: 'image/png',
            platform: 'wide',
            label: 'WorkTrustbd Home Page'
          },
          {
            src: '/screenshots/dashboard.png',
            sizes: '1280x720',
            type: 'image/png',
            platform: 'wide',
            label: 'WorkTrustbd Dashboard'
          },
          {
            src: '/screenshots/messages.png',
            sizes: '1280x720',
            type: 'image/png',
            platform: 'wide',
            label: 'WorkTrustbd Messages & Chat'
          },
          {
            src: '/screenshots/mobile-home.png',
            sizes: '720x1280',
            type: 'image/png',
            platform: 'narrow',
            label: 'Mobile Home View'
          }
        ],
        shortcuts: [
          {
            name: '📊 Dashboard',
            short_name: 'Dashboard',
            description: 'Go to your dashboard',
            url: '/dashboard',
            icons: [
              {
                src: '/icons/icon-96x96.png',
                sizes: '96x96',
                type: 'image/png'
              }
            ]
          },
          {
            name: '💬 Messages',
            short_name: 'Messages',
            description: 'View your messages',
            url: '/messages',
            icons: [
              {
                src: '/icons/icon-96x96.png',
                sizes: '96x96',
                type: 'image/png'
              }
            ]
          },
          {
            name: '💰 Wallet',
            short_name: 'Wallet',
            description: 'Check your wallet balance',
            url: '/wallet',
            icons: [
              {
                src: '/icons/icon-96x96.png',
                sizes: '96x96',
                type: 'image/png'
              }
            ]
          },
          {
            name: '🔍 Find Work',
            short_name: 'Find Work',
            description: 'Browse available jobs',
            url: '/jobs',
            icons: [
              {
                src: '/icons/icon-96x96.png',
                sizes: '96x96',
                type: 'image/png'
              }
            ]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // ✅ 5MB limit
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/api\.cloudinary\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cloudinary-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-storage-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html'
      }
    })
  ],
  // ✅ সব Alias যোগ করুন
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@pages': resolve(__dirname, './src/pages'),
      '@context': resolve(__dirname, './src/context'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@utils': resolve(__dirname, './src/utils'),
      '@assets': resolve(__dirname, './src/assets'),
      '@styles': resolve(__dirname, './src/styles'),
    },
  },
  // ✅ Build Configuration - Rolldown compatible
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ✅ Face API - আলাদা chunk
          if (id.includes('face-api.js')) {
            return 'face-api';
          }
          // ✅ Firebase - আলাদা chunk
          if (id.includes('firebase')) {
            return 'firebase';
          }
          // ✅ React - আলাদা chunk
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'react-vendor';
          }
          // ✅ node_modules এর বাকি সব
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  },
  // ✅ CSP Headers যোগ করুন (Recaptcha + Fonts + Cloudflare Worker এর জন্য)
  server: {
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
          "https://*.firebase.com " +
          "https://*.googleapis.com " +
          "https://*.cloudinary.com " +
          "https://apis.google.com " +
          "https://*.firebaseio.com " +
          "https://www.google.com " +
          "https://www.gstatic.com " +
          "https://*.google.com " +
          "https://*.googletagmanager.com " +
          "https://*.google-analytics.com",
        "style-src 'self' 'unsafe-inline' " +
          "https://fonts.googleapis.com " +
          "https://*.googleapis.com " +
          "https://cdnjs.cloudflare.com " +
          "https://banglawebfonts.pages.dev",
        "font-src 'self' " +
          "https://*.googleapis.com " +
          "https://*.gstatic.com " +
          "https://cdnjs.cloudflare.com " +
          "https://banglawebfonts.pages.dev " +
          "data:",
        "connect-src 'self' " +
          "https://*.firebase.com " +
          "https://*.googleapis.com " +
          "https://*.cloudinary.com " +
          "https://*.firebaseio.com " +
          "https://*.firebaseapp.com " +
          "wss://*.firebaseio.com " +
          "https://www.google.com " +
          "https://*.google.com " +
          "https://*.workers.dev " +
          "https://worktrust-otp-production.hammanmusa362.workers.dev",
        "img-src 'self' data: https: http: blob: " +
          "https://*.cloudinary.com " +
          "https://*.googleapis.com " +
          "https://www.google.com " +
          "https://*.google.com " +
          "https://ui-avatars.com " +
          "https://via.placeholder.com " +
          "https://images.unsplash.com " +
          "https://*.githubusercontent.com " +
          "https://*.gstatic.com",
        "frame-src 'self' " +
          "https://*.firebase.com " +
          "https://apis.google.com " +
          "https://*.firebaseapp.com " +
          "https://www.google.com " +
          "https://*.google.com",
        "worker-src 'self' blob:",
        "media-src 'self' blob: https://*.cloudinary.com",
        "manifest-src 'self'",
      ].join('; '),
    },
  },
  // ✅ Preview-ও CSP যোগ করুন
  preview: {
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
          "https://*.firebase.com " +
          "https://*.googleapis.com " +
          "https://*.cloudinary.com " +
          "https://apis.google.com " +
          "https://*.firebaseio.com " +
          "https://www.google.com " +
          "https://www.gstatic.com " +
          "https://*.google.com",
        "style-src 'self' 'unsafe-inline' " +
          "https://fonts.googleapis.com " +
          "https://*.googleapis.com " +
          "https://cdnjs.cloudflare.com " +
          "https://banglawebfonts.pages.dev",
        "font-src 'self' " +
          "https://*.googleapis.com " +
          "https://*.gstatic.com " +
          "https://cdnjs.cloudflare.com " +
          "https://banglawebfonts.pages.dev " +
          "data:",
        "connect-src 'self' " +
          "https://*.firebase.com " +
          "https://*.googleapis.com " +
          "https://*.cloudinary.com " +
          "https://*.firebaseio.com " +
          "https://*.firebaseapp.com " +
          "wss://*.firebaseio.com " +
          "https://www.google.com " +
          "https://*.google.com " +
          "https://*.workers.dev " +
          "https://worktrust-otp-production.hammanmusa362.workers.dev",
        "img-src 'self' data: https: http: blob: " +
          "https://*.cloudinary.com " +
          "https://*.googleapis.com " +
          "https://www.google.com " +
          "https://*.google.com " +
          "https://ui-avatars.com " +
          "https://via.placeholder.com " +
          "https://images.unsplash.com " +
          "https://*.githubusercontent.com",
        "frame-src 'self' " +
          "https://*.firebase.com " +
          "https://apis.google.com " +
          "https://*.firebaseapp.com " +
          "https://www.google.com",
        "worker-src 'self' blob:",
        "media-src 'self' blob: https://*.cloudinary.com",
        "manifest-src 'self'",
      ].join('; '),
    },
  },
});