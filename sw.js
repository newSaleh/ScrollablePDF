// Makes the app usable with no network at all: opening the page, uploading
// a PDF, reading it (night mode, auto-scroll, everything) all work purely
// from files already on the device. Only optional extras that need a
// third-party library not worth precaching (the PDF export button) still
// require a connection when actually used.
//
// CACHE_NAME is tied to the app's own version string — bump it together
// with BUILD_VERSION/version.txt on every deploy so old clients pick up a
// fresh cache instead of being stuck on stale precached files forever.
const CACHE_NAME = "scrollablepdf-2026-09-07.1";
const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.json",
  "vendor/pdf.min.js",
  "vendor/pdf.worker.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return; // let CDN requests (jsPDF etc.) pass through untouched

  // version.txt is how the app itself detects it's running a stale cached
  // copy — it already fetches with cache:"no-store", so it must reach the
  // real network every time, not be answered from here.
  if(url.pathname.endsWith("/version.txt")) return;

  const isAppShellDoc = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  if(isAppShellDoc){
    // Network-first: an online visit always gets the latest page (so the
    // existing update-checker/banner keeps working normally), and only
    // falls back to the last cached copy when there's no connection.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match("index.html")))
    );
    return;
  }

  // Everything else precached (pdf.js, manifest, icons) rarely changes —
  // cache-first for instant, reliable offline loads, refilling the cache
  // for next time if it's ever missing.
  event.respondWith(
    caches.match(req).then((cached) => {
      if(cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      });
    })
  );
});
