import type { Options, Store } from 'express-rate-limit'
import {
  createRedisRateLimitStoreFactory,
  REDIS_RATE_LIMIT_DECREMENT_SCRIPT,
  REDIS_RATE_LIMIT_INCREMENT_SCRIPT,
  type RedisRateLimitCommandPort,
} from '../../src/security/redisRateLimitStore'

class FakeRedisRateLimitCommands implements RedisRateLimitCommandPort {
  readonly increments: Array<{ key: string; windowMs: number }> = []
  readonly decrements: string[] = []
  readonly deletions: string[] = []
  readonly incrementResult: readonly [number, number]

  constructor(incrementResult: readonly [number, number] = [1, 60_000]) {
    this.incrementResult = incrementResult
  }

  async evalIncrement(key: string, windowMs: number): Promise<readonly [number, number]> {
    this.increments.push({ key, windowMs })
    return this.incrementResult
  }

  async decrement(key: string): Promise<void> {
    this.decrements.push(key)
  }

  async delete(key: string): Promise<void> {
    this.deletions.push(key)
  }
}

const initialize = (store: Store, windowMs: number): void => {
  store.init?.({ windowMs } as Options)
}

test('increment returns hits and deterministic reset time from the atomic result', async () => {
  const commands = new FakeRedisRateLimitCommands([1, 90_000])
  const store = createRedisRateLimitStoreFactory(commands, 'test')('login')
  initialize(store, 90_000)

  jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

  await expect(store.increment('client')).resolves.toEqual({
    totalHits: 1,
    resetTime: new Date(1_700_000_090_000),
  })
  expect(commands.increments).toEqual([
    { key: 'bo2:test:rate-limit:login:client', windowMs: 90_000 },
  ])

  jest.restoreAllMocks()
})

test('later increments use the Redis-provided remaining TTL unchanged', async () => {
  const commands = new FakeRedisRateLimitCommands([2, 12_345])
  const store = createRedisRateLimitStoreFactory(commands, 'production')('heavy')
  initialize(store, 60_000)

  jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

  await expect(store.increment('client')).resolves.toEqual({
    totalHits: 2,
    resetTime: new Date(1_700_000_012_345),
  })
  expect(commands.increments[0]).toEqual({
    key: 'bo2:production:rate-limit:heavy:client',
    windowMs: 60_000,
  })

  jest.restoreAllMocks()
})

test('different policies receive isolated prefixes', async () => {
  const commands = new FakeRedisRateLimitCommands()
  const factory = createRedisRateLimitStoreFactory(commands, 'test')
  const login = factory('login')
  const webhook = factory('webhook')
  initialize(login, 60_000)
  initialize(webhook, 60_000)

  await login.increment('same-client')
  await webhook.increment('same-client')

  expect(commands.increments.map(({ key }) => key)).toEqual([
    'bo2:test:rate-limit:login:same-client',
    'bo2:test:rate-limit:webhook:same-client',
  ])
})

test('decrement and resetKey target one exact namespaced key', async () => {
  const commands = new FakeRedisRateLimitCommands()
  const store = createRedisRateLimitStoreFactory(commands, 'test')('login')
  initialize(store, 60_000)

  await store.decrement('client')
  await store.resetKey('client')

  expect(commands.decrements).toEqual(['bo2:test:rate-limit:login:client'])
  expect(commands.deletions).toEqual(['bo2:test:rate-limit:login:client'])
})

test('command failures are propagated to the rate-limit store caller', async () => {
  const commands: RedisRateLimitCommandPort = {
    evalIncrement: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    decrement: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    delete: jest.fn().mockRejectedValue(new Error('redis unavailable')),
  }
  const store = createRedisRateLimitStoreFactory(commands, 'test')('login')
  initialize(store, 60_000)

  await expect(store.increment('client')).rejects.toThrow('redis unavailable')
  await expect(store.decrement('client')).rejects.toThrow('redis unavailable')
  await expect(store.resetKey('client')).rejects.toThrow('redis unavailable')
})
test('cacheService.connect aceita config Redis e expõe uma porta vinculada', async () => {
  const Redis = (await import('ioredis')).default
  const { cacheService } = await import('../../src/services/cache.service')
  const connect = jest.spyOn(Redis.prototype, 'connect').mockResolvedValue(undefined)
  const disconnect = jest.spyOn(Redis.prototype, 'disconnect').mockImplementation(() => undefined)

  try {
    await cacheService.connect({
      host: 'redis.test',
      port: 6380,
      username: 'api',
      password: 'secret',
    })

    expect(connect).toHaveBeenCalledTimes(1)
    const commands = cacheService.getRateLimitCommandPort()
    expect(commands).toEqual({
      evalIncrement: expect.any(Function),
      decrement: expect.any(Function),
      delete: expect.any(Function),
    })

    await cacheService.disconnect()
    expect(disconnect).toHaveBeenCalledTimes(1)
  } finally {
    connect.mockRestore()
    disconnect.mockRestore()
  }
})
class StatefulFakeRedisRateLimitCommands implements RedisRateLimitCommandPort {
  private now = 0
  private readonly entries = new Map<string, { hits: number; expiresAt: number }>()

  advance(ms: number): void {
    this.now += ms
  }

  async evalIncrement(key: string, windowMs: number): Promise<readonly [number, number]> {
    this.expire(key)
    const entry = this.entries.get(key) ?? { hits: 0, expiresAt: this.now }
    entry.hits += 1
    if (entry.hits === 1) entry.expiresAt = this.now + windowMs
    this.entries.set(key, entry)
    return [entry.hits, entry.expiresAt - this.now]
  }

  async decrement(key: string): Promise<void> {
    this.expire(key)
    const entry = this.entries.get(key)
    if (!entry) return
    if (entry.hits <= 1) {
      this.entries.delete(key)
      return
    }
    entry.hits -= 1
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key)
  }

  private expire(key: string): void {
    const entry = this.entries.get(key)
    if (entry && entry.expiresAt <= this.now) this.entries.delete(key)
  }
}

test('decrement clamps to zero, does not create missing keys, and honors expiry', async () => {
  const commands = new StatefulFakeRedisRateLimitCommands()
  const store = createRedisRateLimitStoreFactory(commands, 'test')('login')
  initialize(store, 1_000)

  await store.decrement('missing')
  await expect(store.increment('client')).resolves.toMatchObject({ totalHits: 1 })
  await store.decrement('client')
  await store.decrement('client')
  await expect(store.increment('client')).resolves.toMatchObject({ totalHits: 1 })

  commands.advance(1_000)
  await store.decrement('client')
  await expect(store.increment('client')).resolves.toMatchObject({ totalHits: 1 })
})

test('rejects an atomic increment result with zero hits', async () => {
  const commands = new FakeRedisRateLimitCommands([0, 60_000])
  const store = createRedisRateLimitStoreFactory(commands, 'test')('login')
  initialize(store, 60_000)

  await expect(store.increment('client')).rejects.toThrow('invalid hit count')
})
test('bound Redis command port executes atomic increment/decrement and exact delete calls', async () => {
  const Redis = (await import('ioredis')).default
  const { cacheService } = await import('../../src/services/cache.service')
  const connect = jest.spyOn(Redis.prototype, 'connect').mockResolvedValue(undefined)
  const evalCommand = jest.spyOn(Redis.prototype, 'eval').mockResolvedValue([3, 12_000])
  const deleteCommand = jest.spyOn(Redis.prototype, 'del').mockResolvedValue(1)
  const disconnect = jest.spyOn(Redis.prototype, 'disconnect').mockImplementation(() => undefined)

  try {
    await cacheService.connect({ host: 'redis.test', port: 6380, username: 'api' })
    const commands = cacheService.getRateLimitCommandPort()

    await expect(commands.evalIncrement('key', 60_000)).resolves.toEqual([3, 12_000])
    await commands.decrement('key')
    await commands.delete('key')

    expect(evalCommand).toHaveBeenNthCalledWith(
      1,
      REDIS_RATE_LIMIT_INCREMENT_SCRIPT,
      1,
      'key',
      60_000,
    )
    expect(evalCommand).toHaveBeenNthCalledWith(
      2,
      REDIS_RATE_LIMIT_DECREMENT_SCRIPT,
      1,
      'key',
    )
    expect(deleteCommand).toHaveBeenCalledWith('key')
  } finally {
    await cacheService.disconnect()
    connect.mockRestore()
    evalCommand.mockRestore()
    deleteCommand.mockRestore()
    disconnect.mockRestore()
  }
})

test('cache connection rejection disconnects the client and resets the singleton', async () => {
  const Redis = (await import('ioredis')).default
  const { cacheService } = await import('../../src/services/cache.service')
  const connectError = new Error('redis connect failed')
  const connect = jest.spyOn(Redis.prototype, 'connect').mockRejectedValue(connectError)
  const disconnect = jest.spyOn(Redis.prototype, 'disconnect').mockImplementation(() => undefined)

  try {
    await expect(
      cacheService.connect({ host: 'redis.test', port: 6380, username: 'api' }),
    ).rejects.toBe(connectError)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(() => cacheService.getRateLimitCommandPort()).toThrow('not connected')
  } finally {
    connect.mockRestore()
    disconnect.mockRestore()
    await cacheService.disconnect()
  }
})
