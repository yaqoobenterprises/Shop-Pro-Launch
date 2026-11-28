// Shop Pro public app shell ONLY. Never persist customer data or API responses.
// Keep workers waiting until existing tabs close to avoid interrupting offline work.
const CACHE_NAME = 'shop-pro-shell-v2';
const OLD_AQVORA_PREFIXES = ['shop-pro-', 'aqvora-pwa-', 'aqvora-shell-'];
const SHELL_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/assets/shop-pro-mark-v2.svg',
  '/fonts/manrope-400.woff',
  '/fonts/manrope-600.woff',
  '/fonts/manrope-700.woff',
  '/assets/shop-pro-v2-192.png',
  '/assets/shop-pro-v2-512.png',
  '/assets/shop-pro-v2-180.png',
  '/assets/shop-pro-v2-maskable.png'
];

function publicAsset(url) {
  if (url.origin !== self.location.origin || url.search) return false;
  if (SHELL_ASSETS.includes(url.pathname)) return true;
  return /^\/assets\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|png|svg|webp|jpe?g)$/.test(url.pathname)
    && !url.pathname.includes('..');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);
    // Bundle entrypoints are public files; cache those for the installed PWA.
    // Lazy chunks are cached only when actually opened, never guessed.
    const shell = await cache.match('/index.html');
    if (!shell) return;
    const html = await shell.text();
    const entries = [...html.matchAll(/(?:src|href)=["'](\/assets\/[a-zA-Z0-9_./-]+\.(?:js|css))["']/g)]
      .map((match) => match[1])
      .filter((path) => publicAsset(new URL(path, self.location.origin)));
    await Promise.allSettled([...new Set(entries)].map((entry) => cache.add(entry)));
    // No skipWaiting(): an active installed cashbook keeps its old worker
    // until its tabs close. This is not permission to alter its local queue.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME &&
      OLD_AQVORA_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .map((key) => caches.delete(key)));
    // Do not claim already-open tabs from another service-worker version.
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Navigation is network-first, with only static HTML fallback offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' });
      } catch {
        return await caches.match('/index.html') || Response.error();
      }
    })());
    return;
  }
  // API, Auth, /rest/v1, /functions, custom report and all other GETs are
  // network-only. An account change cannot reveal cached personal records.
  if (!publicAsset(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const stored = await cache.match(request);
    if (stored) return stored;
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque' &&
        !/\b(?:private|no-store)\b/i.test(response.headers.get('cache-control') || '')) {
      try { await cache.put(request, response.clone()); } catch {
        // Cache quota failure must never break a working online app.
      }
    }
    return response;
  })());
});
