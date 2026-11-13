// Service Worker - Controle de Banco de Horas PWA
const CACHE_NAME = 'timebank-pwa-v1.3.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './Controle_Banco_de_Horas.html',
  './manifest.webmanifest',
  './favicon.svg',
  './css/style.css',
  './js/supabase.js',
  './js/offline.js',
  './js/parser.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Alguns assets falharam no precache inicial:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase APIs: não intercepta com cache estático
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // GET Requests
  if (event.request.method === 'GET') {
    const isCode = url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname === '/' || url.pathname.endsWith('/');

    if (isCode) {
      // Network First para HTML, JS, CSS: sempre busca a versão mais recente quando online
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch(() => caches.match(event.request))
      );
    } else {
      // Cache First para imagens e fontes com Network fallback
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          });
        })
      );
    }
  }
});
