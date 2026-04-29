self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("music-app").then(cache => {
      return cache.addAll([
        "/",
        "/index.html",
        "/style/main.css",
        "/js/app.js",
        "/assets/icons/music-note.png"
      ]);
    })
  );
});