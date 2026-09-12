import logger from '../utils/logger'
import Redis from 'ioredis'
import type { AppConfig } from '../config/appConfig'
import {
  REDIS_RATE_LIMIT_DECREMENT_SCRIPT,
  REDIS_RATE_LIMIT_INCREMENT_SCRIPT,
  type RedisRateLimitCommandPort,
} from '../security/redisRateLimitStore'
import type { UsageStoreCommandPort } from '../observability/usage/usageStore'
import { countUsage } from '../observability/usage/usageMeter'
import { USAGE_METRICS } from '../observability/usage/usageMetrics'

// Familia da chave, sem a parte variavel. "clareza:core:raiox:AAPL" conta como
// "clareza:core": queremos saber que familia pesa, nao que simbolo.
//
// Paramos no primeiro segmento que ja nao seja um nome — getCacheKey() cola JSON
// dos parametros a chave, e esse JSON traz ':' la dentro. Sem esta paragem cada
// combinacao de filtros criava a sua propria serie.
const KEY_SEGMENT = /^[A-Za-z0-9_.-]+$/

function keyFamily(key: string): string {
  const family: string[] = []
  for (const segment of key.split(':')) {
    if (!KEY_SEGMENT.test(segment)) break
    family.push(segment)
    if (family.length === 2) break
  }
  return family.length === 0 ? 'outros' : family.join(':')
}

export interface RedisRefreshJobCommandPort {
  eval(script: string, keys: readonly string[], args: readonly string[]): Promise<unknown>
}

/** Leituras de diagnostico ao proprio Redis, para o painel de capacidade. */
export interface RedisDiagnosticsPort {
  info(section?: string): Promise<string>
  dbSize(): Promise<number>
  /** Amostra de chaves por padrao, com SCAN (nao bloqueia como KEYS). */
  sampleKeys(pattern: string, limit: number): Promise<readonly string[]>
  /** Bytes que uma chave ocupa, incluindo overhead. null se a chave nao existir. */
  memoryUsage(key: string): Promise<number | null>
}

class CacheService {
  private redis: Redis | null = null
  private isConnected = false

  public async connect(
    config: NonNullable<AppConfig['redis']>,
  ): Promise<void> {
    if (this.redis) await this.disconnect()

    const redis = new Redis({
      host: config.host,
      port: config.port,
      username: config.username,
      ...(config.password ? { password: config.password } : {}),
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    })
    this.redis = redis
    this.isConnected = false

    redis.on('connect', () => {
      logger.info('✅ Redis connected')
      this.isConnected = true
    })

    redis.on('error', (error) => {
      logger.error('❌ Redis error:', error)
      this.isConnected = false
    })

    try {
      await redis.connect()
      this.isConnected = true
    } catch (error) {
      this.isConnected = false
      if (this.redis === redis) this.redis = null
      try {
        redis.disconnect()
      } catch {
        // Preserve the original connection failure.
      }
      logger.error('❌ Failed to connect Redis:', error)
      throw error
    }
  }

  public getRateLimitCommandPort(): RedisRateLimitCommandPort {
    const redis = this.redis
    if (!redis || !this.isConnected) {
      throw new Error('Redis is not connected')
    }

    return {
      evalIncrement: async (key, windowMs) => {
        const result = await redis.eval(
          REDIS_RATE_LIMIT_INCREMENT_SCRIPT,
          1,
          key,
          windowMs,
        )
        if (!Array.isArray(result) || result.length < 2) {
          throw new Error('Redis rate-limit increment returned an invalid result')
        }
        const totalHits = Number(result[0])
        const ttlMs = Number(result[1])
        if (!Number.isInteger(totalHits) || !Number.isInteger(ttlMs)) {
          throw new Error('Redis rate-limit increment returned non-numeric values')
        }
        return [totalHits, ttlMs] as const
      },
      decrement: async (key) => {
        await redis.eval(REDIS_RATE_LIMIT_DECREMENT_SCRIPT, 1, key)
      },
      delete: async (key) => {
        await redis.del(key)
      },
    }
  }

  public getRefreshJobCommandPort(): RedisRefreshJobCommandPort {
    return {
      eval: async (script, keys, args) => {
        const redis = this.redis
        if (!redis || !this.isConnected) throw new Error('Redis is not connected')
        return redis.eval(script, keys.length, ...keys, ...args)
      },
    }
  }

  public getUsageStoreCommandPort(): UsageStoreCommandPort {
    const requireRedis = (): Redis => {
      const redis = this.redis
      if (!redis || !this.isConnected) throw new Error('Redis is not connected')
      return redis
    }

    return {
      incrementFields: async (key, fields, ttlSeconds) => {
        const redis = requireRedis()
        const pipeline = redis.pipeline()
        for (const [field, value] of fields) pipeline.hincrby(key, field, value)
        pipeline.expire(key, ttlSeconds)
        await pipeline.exec()
      },
      readHash: async (key) => requireRedis().hgetall(key),
      deleteKey: async (key) => {
        await requireRedis().del(key)
      },
    }
  }

  public getDiagnosticsPort(): RedisDiagnosticsPort {
    const requireRedis = (): Redis => {
      const redis = this.redis
      if (!redis || !this.isConnected) throw new Error('Redis is not connected')
      return redis
    }

    return {
      info: async (section) => (section ? requireRedis().info(section) : requireRedis().info()),
      dbSize: async () => requireRedis().dbsize(),
      sampleKeys: async (pattern, limit) => {
        const redis = requireRedis()
        const found: string[] = []
        let cursor = '0'
        do {
          const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '200')
          found.push(...batch)
          cursor = next
        } while (cursor !== '0' && found.length < limit)
        return found.slice(0, limit)
      },
      memoryUsage: async (key) => requireRedis().memory('USAGE', key) as Promise<number | null>,
    }
  }

  public isReady(): boolean {
    return this.isConnected && this.redis !== null
  }

  public async disconnect(): Promise<void> {
    const redis = this.redis
    this.redis = null
    this.isConnected = false
    if (!redis) return
    redis.disconnect()
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.redis) return null
    
    try {
      const data = await this.redis.get(key)
      countUsage(USAGE_METRICS.cacheOps, {
        op: 'get',
        outcome: data ? 'hit' : 'miss',
        prefix: keyFamily(key),
      })
      return data ? JSON.parse(data) : null
    } catch (error) {
      countUsage(USAGE_METRICS.cacheOps, { op: 'get', outcome: 'error', prefix: keyFamily(key) })
      logger.error('Cache get error:', error)
      return null
    }
  }

  async set(key: string, value: unknown, ttl = 300): Promise<void> {
    if (!this.isConnected || !this.redis) return

    try {
      const payload = JSON.stringify(value)
      await this.redis.setex(key, ttl, payload)
      countUsage(USAGE_METRICS.cacheOps, { op: 'set', outcome: 'ok', prefix: keyFamily(key) })
      countUsage(
        USAGE_METRICS.cacheBytesWritten,
        { prefix: keyFamily(key) },
        Buffer.byteLength(payload),
      )
    } catch (error) {
      countUsage(USAGE_METRICS.cacheOps, { op: 'set', outcome: 'error', prefix: keyFamily(key) })
      logger.error('Cache set error:', error)
    }
  }

  // Variantes "raw": guardam/servem a string tal como está, sem JSON.parse/stringify.
  // Úteis para payloads grandes (ex.: Top 10) onde o custo é a (de)serialização por request.
  async getRaw(key: string): Promise<string | null> {
    if (!this.isConnected || !this.redis) return null

    try {
      const data = await this.redis.get(key)
      countUsage(USAGE_METRICS.cacheOps, {
        op: 'get',
        outcome: data ? 'hit' : 'miss',
        prefix: keyFamily(key),
      })
      return data
    } catch (error) {
      countUsage(USAGE_METRICS.cacheOps, { op: 'get', outcome: 'error', prefix: keyFamily(key) })
      logger.error('Cache getRaw error:', error)
      return null
    }
  }

  async setRaw(key: string, value: string, ttl = 300): Promise<void> {
    if (!this.isConnected || !this.redis) return

    try {
      await this.redis.setex(key, ttl, value)
      countUsage(USAGE_METRICS.cacheOps, { op: 'set', outcome: 'ok', prefix: keyFamily(key) })
      countUsage(
        USAGE_METRICS.cacheBytesWritten,
        { prefix: keyFamily(key) },
        Buffer.byteLength(value),
      )
    } catch (error) {
      countUsage(USAGE_METRICS.cacheOps, { op: 'set', outcome: 'error', prefix: keyFamily(key) })
      logger.error('Cache setRaw error:', error)
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected || !this.redis) return
    
    try {
      await this.redis.del(key)
    } catch (error) {
      logger.error('Cache delete error:', error)
    }
  }

  // Lista as chaves que correspondem a um padrão (ex.: "clareza:raiox:v1:*"),
  // sem as apagar. Usa SCAN (não bloqueia o Redis como KEYS em datasets grandes).
  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected || !this.redis) return []

    try {
      const found: string[] = []
      let cursor = '0'
      do {
        const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', '200')
        found.push(...batch)
        cursor = next
      } while (cursor !== '0')
      return found
    } catch (error) {
      logger.error('Cache keys/scan error:', error)
      return []
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.redis) return
    
    try {
      const keys = await this.redis.keys(pattern)
      if (keys.length > 0) {
        await this.redis.del(...keys)
      }
    } catch (error) {
      logger.error('Cache invalidate error:', error)
    }
  }

  async flush(): Promise<void> {
    if (!this.isConnected || !this.redis) return
    
    try {
      await this.redis.flushdb()
    } catch (error) {
      logger.error('Cache flush error:', error)
    }
  }

  getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
      if (params[key] !== undefined && params[key] !== null) {
        acc[key] = params[key]
      }
      return acc
    }, {} as Record<string, unknown>)

    return `${prefix}:${JSON.stringify(sortedParams)}`
  }
}

export const cacheService = new CacheService()
