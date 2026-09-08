import {
  RedisRefreshJobStore,
  type RedisRefreshJobCommandPort,
} from '../../../src/services/clareza/operations/redisRefreshJobStore'
import { withCanonicalExecution } from '../../../src/services/clareza/core/canonicalExecutionContext'

class ScriptedRedisPort implements RedisRefreshJobCommandPort {
  readonly calls: Array<{ script: string; keys: readonly string[]; args: readonly string[] }> = []

  constructor(private readonly replies: unknown[]) {}

  async eval(script: string, keys: readonly string[], args: readonly string[]): Promise<unknown> {
    this.calls.push({ script, keys, args })
    return this.replies.shift()
  }
}

const running = JSON.stringify({
  status: 'running',
  startedAt: '2026-09-01T10:00:00.000Z',
  resumed: true,
  completedItems: 1,
})

test('refuses the Redis claim when the outer receipt lost ownership', async () => {
  const port = new ScriptedRedisPort([])
  const store = new RedisRefreshJobStore(port)

  await expect(withCanonicalExecution({
    assertOwnership: () => { throw new Error('ownership lost') },
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }, () => store.claim('owner-a', '2026-09-08T10:00:00.000Z', 30_000)))
    .rejects.toThrow('ownership lost')

  expect(port.calls).toHaveLength(0)
})

test('refuses Redis state reconciliation when the outer receipt lost ownership', async () => {
  const port = new ScriptedRedisPort([])
  const store = new RedisRefreshJobStore(port)

  await expect(withCanonicalExecution({
    assertOwnership: () => { throw new Error('ownership lost') },
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }, () => store.read())).rejects.toThrow('ownership lost')

  expect(port.calls).toHaveLength(0)
})

test('maps an atomic Redis claim with persisted checkpoints', async () => {
  const port = new ScriptedRedisPort([[1, 1, running, 'AAPL']])
  const store = new RedisRefreshJobStore<{ total: number; errors: number }>(port, 'test:raiox')

  await expect(store.claim('owner-secret', '2026-09-01T10:01:00.000Z', 30_000)).resolves.toEqual({
    acquired: true,
    resumed: true,
    state: JSON.parse(running),
    completedItems: ['AAPL'],
  })
  expect(port.calls[0]?.keys).toEqual([
    'test:raiox:lease',
    'test:raiox:state',
    'test:raiox:completed',
  ])
  expect(port.calls[0]?.args).toContain('owner-secret')
})

test('uses owner-fenced Redis mutations and safe persisted state reads', async () => {
  const succeeded = JSON.stringify({
    status: 'succeeded',
    startedAt: '2026-09-01T10:00:00.000Z',
    finishedAt: '2026-09-01T10:05:00.000Z',
    result: { total: 185, errors: 0 },
    completedItems: 185,
  })
  const port = new ScriptedRedisPort([running, 1, 1, 1, 1, succeeded])
  const store = new RedisRefreshJobStore<{ total: number; errors: number }>(port, 'test:raiox')

  await expect(store.read()).resolves.toEqual(JSON.parse(running))
  await expect(store.renew('owner-secret', 30_000)).resolves.toBe(true)
  await expect(store.owns('owner-secret')).resolves.toBe(true)
  await expect(store.checkpoint('owner-secret', 'MSFT')).resolves.toBe(true)
  await expect(store.complete('owner-secret', '2026-09-01T10:05:00.000Z', {
    total: 185,
    errors: 0,
  })).resolves.toBe(true)
  await expect(store.read()).resolves.toEqual(JSON.parse(succeeded))

  for (const call of port.calls.slice(1, 5)) expect(call.args).toContain('owner-secret')
})

test('fails closed for malformed Redis script results', async () => {
  const store = new RedisRefreshJobStore(new ScriptedRedisPort([null]), 'test:raiox')
  await expect(store.claim('owner', '2026-09-01T10:00:00.000Z', 30_000))
    .rejects.toThrow('Redis refresh job claim returned an invalid result')
})
