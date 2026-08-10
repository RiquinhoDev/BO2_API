import type { Store } from 'express-rate-limit'
import type { RateLimitPolicyName } from './httpPerimeter'

/**
 * The Redis command boundary used by the rate-limit store.
 *
 * Keeping this small prevents the security middleware from depending on a
 * concrete Redis client and makes the atomic counter contract testable
 * without opening a socket.
 */
export interface RedisRateLimitCommandPort {
  evalIncrement: (
    key: string,
    windowMs: number,
  ) => Promise<readonly [number, number]>
  decrement: (key: string) => Promise<void>
  delete: (key: string) => Promise<void>
}

/** The Lua operation that increments a counter and applies its first-hit TTL. */
export const REDIS_RATE_LIMIT_INCREMENT_SCRIPT = [
  "local current = redis.call('INCR', KEYS[1])",
  "if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  'return {current, ttl}',
].join('\n')

export const REDIS_RATE_LIMIT_DECREMENT_SCRIPT = [
  "local current = redis.call('GET', KEYS[1])",
  "if not current then return 0 end",
  'current = tonumber(current)',
  "if current <= 1 then redis.call('DEL', KEYS[1]); return 0 end",
  "return redis.call('DECR', KEYS[1])",
].join('\n')
export type RateLimitStoreFactory = (policy: RateLimitPolicyName) => Store

const assertWindowMs = (windowMs: number | undefined): number => {
  if (typeof windowMs !== 'number' || !Number.isInteger(windowMs) || windowMs <= 0) {
    throw new Error('Redis rate-limit store requires a positive windowMs')
  }
  return windowMs
}

const assertIncrementResult = (
  result: readonly [number, number],
): readonly [number, number] => {
  const [totalHits, ttlMs] = result
  if (!Number.isInteger(totalHits) || totalHits < 1) {
    throw new Error('Redis rate-limit store returned an invalid hit count')
  }
  if (!Number.isInteger(ttlMs)) {
    throw new Error('Redis rate-limit store returned an invalid TTL')
  }
  return [totalHits, ttlMs]
}

export function createRedisRateLimitStoreFactory(
  commands: RedisRateLimitCommandPort,
  namespace: string,
): RateLimitStoreFactory {
  return (policy) => {
    const prefix = `bo2:${namespace}:rate-limit:${policy}:`
    let windowMs: number | undefined

    const keyFor = (key: string): string => `${prefix}${key}`

    return {
      localKeys: false,
      prefix,
      init: (options) => {
        windowMs = assertWindowMs(options.windowMs)
      },
      increment: async (key) => {
        const result = assertIncrementResult(
          await commands.evalIncrement(keyFor(key), assertWindowMs(windowMs)),
        )
        const [totalHits, ttlMs] = result
        return {
          totalHits,
          resetTime: ttlMs >= 0 ? new Date(Date.now() + ttlMs) : undefined,
        }
      },
      decrement: (key) => commands.decrement(keyFor(key)),
      resetKey: (key) => commands.delete(keyFor(key)),
    }
  }
}
