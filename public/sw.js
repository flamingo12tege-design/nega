// Bump this when deployments change hashed assets so old entries are purged.
const CACHE_NAME = "cas-shell-v5";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : undefined)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation and app entry HTML must always come from the network.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  // Cache only public, versioned static assets; never cache HTML or route documents.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetchAsset(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
  }
});

/**
 * Vercel can cache a transient 404 on /assets/* with `immutable`, so a file that
 * exists on the new deployment may keep returning 404 from the edge. Retrying
 * with a unique query string changes the CDN cache key and reaches the origin.
 */
async function fetchAsset(request) {
  const response = await fetch(request);
  if (response.status !== 404) return response;
  const retryUrl = new URL(request.url);
  retryUrl.searchParams.set("__retry", String(Date.now()));
  try {
    const retry = await fetch(retryUrl.toString(), { cache: "reload" });
    return retry.ok ? retry : response;
  } catch {
    return response;
  }
}
