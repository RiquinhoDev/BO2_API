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

  async del(key: string): Promise<void> {
    if (!this.isConnected || !this.redis) return
    
    try {
      await this.redis.del(key)
    } catch (error) {
      console.error('Cache delete error:', error)
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