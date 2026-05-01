const CACHE_NAME = "music-app-v1";

// 初期キャッシュ（アプリ本体）
const APP_SHELL = [
  "/music-app/",
  "/music-app/index.html",
  "/music-app/style/main.css",
  "/music-app/js/app.js",
  "/music-app/assets/icons/music-note.png"
];


// ==========================
// ① インストール（アプリ本体をキャッシュ）
// ==========================
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

// ==========================
// ② フェッチ（オフライン保存した曲も返す）
// ==========================
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // ★ オフライン保存した曲（/offline/xxx）を優先的に返す
  if (url.pathname.startsWith("/offline/")) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // ★ 通常のキャッシュ（アプリ本体）
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

