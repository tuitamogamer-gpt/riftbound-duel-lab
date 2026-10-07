const APP_CACHE = "riftbound-app-__BUILD_ID__";
const ART_CACHE = "riftbound-deck-art-v1";
const CACHE_PREFIX = "riftbound-app-";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/offline-assets.json", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Offline asset manifest unavailable");
      const { assets } = await response.json();
      const cache = await caches.open(APP_CACHE);
      await cache.addAll(assets);
      // Updates wait for existing tabs to close, preserving their hashed chunks.
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== APP_CACHE)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Private rooms and every API response always go directly to the server.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/"))
    return;
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          // Keep the install-time shell paired with this worker's complete cache.
          return await fetch(request);
        } catch {
          return (await caches.match("/index.html")) || Response.error();
        }
      })(),
    );
    return;
  }
  const appAsset =
    url.origin === self.location.origin &&
    (/^\/assets\//.test(url.pathname) ||
      ["/manifest.webmanifest", "/app-icon.svg", "/favicon.svg"].includes(
        url.pathname,
      ));
  const image = request.destination === "image";
  if (!appAsset && !image) return;
  event.respondWith(
    (async () => {
      // These URL-specific files are identical regardless of the Origin header.
      // Module/CSS requests differ from install-time requests on Vary: Origin servers.
      const cached = await caches.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (appAsset && response.ok) {
        const cache = await caches.open(APP_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
self.addEventListener("message", (event) => {
  const port = event.ports[0];
  if (!port) return;
  if (event.data?.type === "CACHE_DECK") {
    event.waitUntil(
      (async () => {
        const urls = [...new Set(event.data.urls || [])]
          .filter((value) => {
            if (typeof value !== "string") return false;
            try {
              const url = new URL(value, self.location.origin);
              return (
                (url.origin === self.location.origin &&
                  url.pathname.startsWith("/cards/")) ||
                url.protocol === "https:"
              );
            } catch {
              return false;
            }
          })
          .slice(0, 1500);
        const cache = await caches.open(ART_CACHE);
        let cached = 0,
          failed = 0;
        let next = 0;
        const download = async () => {
          while (next < urls.length) {
            const value = urls[next++];
            try {
              const url = new URL(value, self.location.origin);
              const request = new Request(url, {
                mode:
                  url.origin === self.location.origin
                    ? "same-origin"
                    : "no-cors",
              });
              if (!(await cache.match(request, { ignoreVary: true }))) {
                const response = await fetch(request, {
                  signal: AbortSignal.timeout(15000),
                });
                if (!response.ok && response.type !== "opaque")
                  throw new Error("Image unavailable");
                await cache.put(request, response);
              }
              cached++;
            } catch {
              failed++;
            }
            port.postMessage({
              cached,
              failed,
              total: urls.length,
              done: false,
            });
          }
        };
        await Promise.all(Array.from({ length: 3 }, download));
        port.postMessage({ cached, failed, total: urls.length, done: true });
      })().catch(() =>
        port.postMessage({
          cached: 0,
          failed: 0,
          total: 0,
          done: true,
          error:
            "Deck download failed. Check your connection and available storage.",
        }),
      ),
    );
  } else if (event.data?.type === "CLEAR_DECK_ART") {
    event.waitUntil(
      caches.delete(ART_CACHE).then(() => port.postMessage({ done: true })),
    );
  }
});
