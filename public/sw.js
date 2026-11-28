// Bump this when deployments change hashed assets so old entries are purged.
const CACHE_PREFIX = "cas-shell-";
const CACHE_NAME = "cas-shell-v14";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .catch(() => undefined),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation and app entry HTML must always come from the network.
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Cache only public, versioned static assets; never cache HTML or route documents.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(event.request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put("/", copy))
        .catch(() => undefined);
    }
    return response;
  } catch {
    return (await caches.match("/")) || offlineResponse("text/plain");
  }
}

async function cacheFirst(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;
  } catch {
    // Cache lookup failed; fall through to the network.
  }

  try {
    const response = await fetchAsset(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(request, copy))
        .catch(() => undefined);
    }
    return response;
  } catch {
    // Never reject the FetchEvent: a failed fetch must not produce an unhandled
    // "network error response" in the browser console.
    return offlineResponse("application/javascript");
  }
}

function offlineResponse(type) {
  return new Response("", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": type },
  });
}

/**
 * Vercel can cache a transient 404 on /assets/* with `immutable`, so a file that
 * exists on the new deployment may keep returning 404 from the edge. Retrying
 * with a unique query string changes the CDN cache key and reaches the origin.
 * A rejected fetch is caught here so the service worker never throws.
 */
async function fetchAsset(request) {
  try {
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
  } catch {
    return offlineResponse("application/javascript");
  }
}
