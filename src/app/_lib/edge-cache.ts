/**
 * A small read-through cache on Cloudflare's Cache API (`caches.default`), for public data that
 * changes rarely and would otherwise cost a database query on every page view (#88). It keeps
 * Neon asleep between views: one read per cache period per Cloudflare data centre.
 *
 * Only for data that is safe to show any visitor: never personal data, never anything that
 * depends on who is asking. Values are stored as JSON.
 */

/** The part of Cloudflare's Cache API used here; a fake stands in for it in tests. */
export interface EdgeCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

/**
 * Cloudflare's default cache inside the Worker, or undefined where there is none (`next dev`
 * on Node, unit tests): callers then read the source every time, as before.
 */
export function defaultEdgeCache(): EdgeCache | undefined {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
}

/**
 * Returns the cached value for `key`, or loads it, stores it for `ttlSeconds` and returns it.
 * A failed load is not stored, so the next call tries again; it still throws to the caller.
 * Cache errors never fail the page: a broken read falls through to `load`, a broken write is
 * dropped. The write is awaited, adding a little time to a miss (once per period per data
 * centre); `waitUntil` would avoid that but tie this file to the Worker runtime.
 */
export async function cachedJson<T>(
  cache: EdgeCache | undefined,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  if (!cache) return load();
  try {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as T;
  } catch {
    // An unreadable entry is treated as a miss.
  }
  const value = await load();
  try {
    await cache.put(
      key,
      new Response(JSON.stringify(value), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${ttlSeconds}`,
        },
      }),
    );
  } catch {
    // Not cached this time; the next view loads again.
  }
  return value;
}
