import {
  InMemoryRefreshJobStore,
  RefreshJobCoordinator,
  RefreshJobLeaseLostError,
  type RefreshJobExecutionContext,
} from '../../../src/services/clareza/operations/refreshJobCoordinator'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('RefreshJobCoordinator', () => {
  it('starts without waiting and persists completion for polling', async () => {
    const task = deferred<{ total: number; errors: number }>()
    const store = new InMemoryRefreshJobStore<{ total: number; errors: number }>()
    const coordinator = new RefreshJobCoordinator(() => task.promise, undefined, store)

    await expect(coordinator.start()).resolves.toMatchObject({ status: 'running', reused: false })
    task.resolve({ total: 185, errors: 0 })
    await task.promise
    await flush()

    await expect(coordinator.status()).resolves.toMatchObject({
      status: 'succeeded',
      result: { total: 185, errors: 0 },
    })
  })

  it('coalesces concurrent starts through one store lease', async () => {
    const task = deferred<{ total: number; errors: number }>()
    const run = jest.fn(() => task.promise)
    const store = new InMemoryRefreshJobStore<{ total: number; errors: number }>()
    const first = new RefreshJobCoordinator(run, undefined, store, { ownerId: () => 'owner-a' })
    const second = new RefreshJobCoordinator(run, undefined, store, { ownerId: () => 'owner-b' })

    await expect(first.start()).resolves.toMatchObject({ status: 'running', reused: false })
    await expect(second.start()).resolves.toMatchObject({ status: 'running', reused: true })
    expect(run).toHaveBeenCalledTimes(1)
    task.resolve({ total: 185, errors: 0 })
    await flush()
  })

  it('marks an expired running lease interrupted and resumes its checkpoints', async () => {
    let now = 1_000
    let firstContext: RefreshJobExecutionContext | undefined
    const firstTask = deferred<{ total: number; errors: number }>()
    const resumedTask = deferred<{ total: number; errors: number }>()
    const store = new InMemoryRefreshJobStore<{ total: number; errors: number }>(() => now)
    const first = new RefreshJobCoordinator(async context => {
      firstContext = context
      await context.markCompleted('AAPL')
      return firstTask.promise
    }, undefined, store, {
      ownerId: () => 'owner-a', leaseMs: 100, heartbeatMs: 10_000, now: () => now,
    })
    const resumed = new RefreshJobCoordinator(async context => {
      expect(context.completedItems).toEqual(['AAPL'])
      expect(context.startedAt).toBe(new Date(1_000).toISOString())
      return resumedTask.promise
    }, undefined, store, {
      ownerId: () => 'owner-b', leaseMs: 100, heartbeatMs: 10_000, now: () => now,
    })

    await first.start()
    await flush()
    now += 101
    await expect(first.status()).resolves.toMatchObject({ status: 'interrupted', completedItems: 1 })
    await expect(resumed.start()).resolves.toMatchObject({
      status: 'running', reused: false, resumed: true, completedItems: 1,
    })
    await expect(firstContext?.assertLease()).rejects.toBeInstanceOf(RefreshJobLeaseLostError)

    resumedTask.resolve({ total: 185, errors: 0 })
    firstTask.resolve({ total: 185, errors: 0 })
    await flush()
  })

  it('keeps safe failure state and permits a fresh retry', async () => {
    const run = jest
      .fn<Promise<{ total: number; errors: number }>, [RefreshJobExecutionContext]>()
      .mockRejectedValueOnce(new Error('secret provider detail'))
      .mockResolvedValueOnce({ total: 1, errors: 0 })
    const store = new InMemoryRefreshJobStore<{ total: number; errors: number }>()
    const coordinator = new RefreshJobCoordinator(run, undefined, store)

    await coordinator.start()
    await flush()
    await expect(coordinator.status()).resolves.toMatchObject({ status: 'failed' })
    await expect(coordinator.status()).resolves.not.toHaveProperty('error')
    await expect(coordinator.start()).resolves.toMatchObject({ status: 'running', reused: false })
    expect(run).toHaveBeenCalledTimes(2)
    await flush()
  })
})
