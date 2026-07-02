import Redis from 'ioredis'

class CacheService {
  private redis: Redis | null = null
  private isConnected = false

  public async connect() {
    console.log('[Redis Config]', {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD?.slice(0, 5) + '...'
    })

    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        username: process.env.REDIS_USERNAME || 'default',
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      })

      this.redis.on('connect', () => {
        console.log('✅ Redis connected')
        this.isConnected = true
      })

      this.redis.on('error', (err) => {
        console.error('❌ Redis error:', err)
        this.isConnected = false
      })
    } catch (error) {
      console.error('❌ Failed to initialize Redis:', error)
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.redis) return null
    
    try {
      const data = await this.redis.get(key)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  async set(key: string, value: any, ttl = 300): Promise<void> {
    if (!this.isConnected || !this.redis) return

    try {
      await this.redis.setex(key, ttl, JSON.stringify(value))
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  // Variantes "raw": guardam/servem a string tal como está, sem JSON.parse/stringify.
  // Úteis para payloads grandes (ex.: Top 10) onde o custo é a (de)serialização por request.
  async getRaw(key: string): Promise<string | null> {
    if (!this.isConnected || !this.redis) return null

    try {
      return await this.redis.get(key)
    } catch (error) {
      console.error('Cache getRaw error:', error)
      return null
    }
  }

  async setRaw(key: string, value: string, ttl = 300): Promise<void> {
    if (!this.isConnected || !this.redis) return

    try {
      await this.redis.setex(key, ttl, value)
    } catch (error) {
      console.error('Cache setRaw error:', error)
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected || !this.redis) return
    
    try {
      await this.redis.del(key)
    } catch (error) {
      console.error('Cache delete error:', error)
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
      console.error('Cache keys/scan error:', error)
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
      console.error('Cache invalidate error:', error)
    }
  }

  async flush(): Promise<void> {
    if (!this.isConnected || !this.redis) return
    
    try {
      await this.redis.flushdb()
    } catch (error) {
      console.error('Cache flush error:', error)
    }
  }

  getCacheKey(prefix: string, params: any): string {
    const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
      if (params[key] !== undefined && params[key] !== null) {
        acc[key] = params[key]
      }
      return acc
    }, {} as any)

    return `${prefix}:${JSON.stringify(sortedParams)}`
  }
}

export const cacheService = new CacheService()