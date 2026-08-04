import type { Options, Store } from 'express-rate-limit'
import {
  createRedisRateLimitStoreFactory,
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
