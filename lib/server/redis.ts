/**
 * Redis client singleton with graceful degradation.
 * If REDIS_URL is not set or Redis is unreachable, all cache operations
 * are no-ops — the app continues to work without caching.
 */

import Redis from "ioredis";

// TTLs in seconds
export const TTL = {
  SCORECARD: 7 * 24 * 60 * 60,  // 7 days — completed match data never changes
  MATCH_LIST: 30 * 60,           // 30 minutes — new matches added during season
  SERIES_ID: 60 * 60,            // 1 hour — series structure rarely changes
  ROOM: 30,                      // 30 seconds — live auction data
  AUCTION_LIVE: 1,                // 1 second - live auction bridge
  LEADERBOARD: 60,               // 1 minute
} as const;

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | null | undefined;
}

function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on("error", (err) => {
    // Swallow — graceful degradation, don't crash the app
    console.warn("[redis] connection error:", err.message);
  });

  return client;
}

function getRedis(): Redis | null {
  if (process.env.NODE_ENV === "production") {
    // In production, create once per process
    if (global.__redis === undefined) {
      global.__redis = createRedisClient();
    }
    return global.__redis ?? null;
  }

  // In development, reuse across hot reloads
  if (!global.__redis) {
    global.__redis = createRedisClient();
  }
  return global.__redis;
}

/**
 * Get a cached JSON value. Returns null on miss or Redis error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

/**
 * Set a JSON value with TTL. Silently fails on Redis error.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Ignore — cache is best-effort
  }
}

/**
 * Fetch-or-cache helper. Runs `fn` if key is not in cache, stores the result.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const result = await fn();
  await cacheSet(key, result, ttlSeconds);
  return result;
}

/**
 * Delete one or more cache keys (e.g. after accepting a match).
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    // Ignore
  }
}

export async function withRedisLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return fn();

  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  try {
    const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
    if (acquired !== "OK") {
      return fn();
    }

    try {
      return await fn();
    } finally {
      const current = await redis.get(key).catch(() => null);
      if (current === token) {
        await redis.del(key).catch(() => undefined);
      }
    }
  } catch {
    return fn();
  }
}
