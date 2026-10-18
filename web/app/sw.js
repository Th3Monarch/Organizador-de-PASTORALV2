/**
 * sw.js - Service Worker para Organizador de Pastoral 2.0 (PWA en iOS y Web)
 */

const CACHE_NAME = 'pastoral-pwa-v2.5.6';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=2.5.6',
  './app.js?v=2.5.6',
  './pastoral-firebase.js?v=2.5.6',
  './pastoral-pwa-adapter.js?v=2.5.6',
  './markdown.js?v=2.5.6',
  './liturgical.js?v=2.5.6',
  './song-data.js?v=2.5.6',
  './liturgical-templates.js?v=2.5.6',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/screenshot-desktop.png',
  './icons/screenshot-mobile.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[PWA] Precaching warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // No interceptar peticiones a la API de Gemini, OpenRouter, GitHub ni Firebase / Google APIs
  if (url.includes('googleapis.com') || url.includes('openrouter.ai') || url.includes('api.github.com') || url.includes('firebaseio.com') || url.includes('gstatic.com') || url.includes('google.com')) {
    return;
  }

  // Estrategia Network-First: Siempre obtiene la versión más fresca cuando hay internet.
  // Si el usuario está offline, recurre de inmediato a la copia en caché.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
