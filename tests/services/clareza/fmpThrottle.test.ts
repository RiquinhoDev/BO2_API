import {
  FmpThrottleAbortedError,
  FmpThrottleQueueFullError,
  FmpTokenBucket,
} from '../../../src/services/clareza/fmpThrottle'

describe('FmpTokenBucket', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-31T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function createBucket(maxQueueLength = 2): FmpTokenBucket {
    return new FmpTokenBucket({
      capacity: 1,
      refillPerMinute: 60,
      maxQueueLength,
    })
  }

  it('serves queued requests in FIFO order at the configured refill rate', async () => {
    const bucket = createBucket()
    const order: string[] = []

    await expect(bucket.acquire()).resolves.toBeUndefined()
    const second = bucket.acquire().then(() => { order.push('second') })
    const third = bucket.acquire().then(() => { order.push('third') })
    expect(bucket.pendingCount).toBe(2)

    await jest.advanceTimersByTimeAsync(1000)
    await second
    expect(order).toEqual(['second'])
    expect(bucket.pendingCount).toBe(1)

    await jest.advanceTimersByTimeAsync(1000)
    await third
    expect(order).toEqual(['second', 'third'])
    expect(bucket.pendingCount).toBe(0)
  })

  it('fails closed when the bounded wait queue is full', async () => {
    const bucket = createBucket(1)

    await bucket.acquire()
    const queued = bucket.acquire()
    await expect(bucket.acquire()).rejects.toBeInstanceOf(FmpThrottleQueueFullError)
    expect(bucket.pendingCount).toBe(1)

    await jest.advanceTimersByTimeAsync(1000)
    await expect(queued).resolves.toBeUndefined()
  })

  it('removes and rejects a cancelled waiter without consuming its queue slot', async () => {
    const bucket = createBucket(1)
    const controller = new AbortController()

    await bucket.acquire()
    const cancelled = bucket.acquire(controller.signal)
    expect(bucket.pendingCount).toBe(1)
    controller.abort()

    await expect(cancelled).rejects.toBeInstanceOf(FmpThrottleAbortedError)
    expect(bucket.pendingCount).toBe(0)

    const replacement = bucket.acquire()
    expect(bucket.pendingCount).toBe(1)
    await jest.advanceTimersByTimeAsync(1000)
    await expect(replacement).resolves.toBeUndefined()
  })

  it('rejects an already cancelled request before consuming a token', async () => {
    const bucket = createBucket()
    const controller = new AbortController()
    controller.abort()

    await expect(bucket.acquire(controller.signal)).rejects.toBeInstanceOf(FmpThrottleAbortedError)
    await expect(bucket.acquire()).resolves.toBeUndefined()
    expect(bucket.pendingCount).toBe(0)
  })
})
