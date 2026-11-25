import { describe, expect, it, vi } from "vitest";
import { cachedJson, defaultEdgeCache, type EdgeCache } from "./edge-cache";

/** An in-memory stand-in for caches.default that records the max-age it was given. */
function fakeCache() {
  const store = new Map<string, { body: string; cacheControl: string | null }>();
  const cache: EdgeCache = {
    match: async (key) => {
      const entry = store.get(key);
      return entry ? new Response(entry.body) : undefined;
    },
    put: async (key, response) => {
      store.set(key, {
        body: await response.text(),
        cacheControl: response.headers.get("cache-control"),
      });
    },
  };
  return { cache, store };
}

const KEY = "https://staging.example/_cache/hbcs-active/v1";
const HBCS = [{ id: "a", name: "Judea" }];

describe("cachedJson", () => {
  it("loads on a miss and stores the value for the given time", async () => {
    const { cache, store } = fakeCache();
    const load = vi.fn(async () => HBCS);
    expect(await cachedJson(cache, KEY, 21600, load)).toEqual(HBCS);
    expect(load).toHaveBeenCalledTimes(1);
    expect(store.get(KEY)?.cacheControl).toBe("public, max-age=21600");
  });

  it("serves a hit without loading", async () => {
    const { cache } = fakeCache();
    await cachedJson(cache, KEY, 60, async () => HBCS);
    const load = vi.fn(async () => [{ id: "b", name: "Other" }]);
    expect(await cachedJson(cache, KEY, 60, load)).toEqual(HBCS);
    expect(load).not.toHaveBeenCalled();
  });

  it("doesn't store a failed load, so the next call tries again", async () => {
    const { cache, store } = fakeCache();
    await expect(
      cachedJson(cache, KEY, 60, async () => {
        throw new Error("database down");
      }),
    ).rejects.toThrow("database down");
    expect(store.has(KEY)).toBe(false);
    expect(await cachedJson(cache, KEY, 60, async () => HBCS)).toEqual(HBCS);
  });

  it("loads every time when there is no cache", async () => {
    const load = vi.fn(async () => HBCS);
    await cachedJson(undefined, KEY, 60, load);
    await cachedJson(undefined, KEY, 60, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("falls through to the loader when the cache itself fails", async () => {
    const broken: EdgeCache = {
      match: async () => {
        throw new Error("cache read failed");
      },
      put: async () => {
        throw new Error("cache write failed");
      },
    };
    expect(await cachedJson(broken, KEY, 60, async () => HBCS)).toEqual(HBCS);
  });

  it("finds no cache outside the Worker", () => {
    expect(defaultEdgeCache()).toBeUndefined();
  });
});
