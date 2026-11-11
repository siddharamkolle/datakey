import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { datakeyConfig } from "@config/datakey.config";

// In-memory fallback map for local testing when Upstash Redis is not connected
const localMemoryStore = new Map<string, { count: number; resetAt: number }>();

function getRedisInstance(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({
    url,
    token,
  });
}

/**
 * Checks rate limits for a given identifier (e.g. hash of IP + action).
 * Default rate limit for finder form is derived from datakeyConfig.
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = datakeyConfig.security.rateLimits.finderFormSubmissionsPerHour,
  windowSeconds: number = 3600
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const redis = getRedisInstance();

  if (redis) {
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      analytics: false,
      prefix: "datakey_ratelimit",
    });

    const result = await ratelimit.limit(identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  }

  // Fallback to local memory limiter if Redis is not configured
  const now = Date.now();
  const entry = localMemoryStore.get(identifier);

  if (!entry || now > entry.resetAt) {
    localMemoryStore.set(identifier, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return { success: true, remaining: limit - 1, reset: now + windowSeconds * 1000 };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, reset: entry.resetAt };
  }

  entry.count += 1;
  return { success: true, remaining: limit - entry.count, reset: entry.resetAt };
}
