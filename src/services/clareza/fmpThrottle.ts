// Limitador local partilhado pelas ferramentas Clareza nesta instância Node.
// A taxa preserva o comportamento existente. Não coordena réplicas/processos.

const CAPACITY = 150
const REFILL_PER_MINUTE = 2400
const MAX_QUEUE_LENGTH = 500

export interface FmpTokenBucketConfig {
  readonly capacity: number
  readonly refillPerMinute: number
  readonly maxQueueLength: number
}

interface Waiter {
  readonly resolve: () => void
  readonly reject: (error: Error) => void
  readonly signal?: AbortSignal
  abortListener?: () => void
}

export class FmpThrottleAbortedError extends Error {
  constructor() {
    super('FMP throttle wait aborted')
    this.name = 'FmpThrottleAbortedError'
  }
}

export class FmpThrottleQueueFullError extends Error {
  constructor(maxQueueLength: number) {
    super(`FMP throttle queue is full (${maxQueueLength})`)
    this.name = 'FmpThrottleQueueFullError'
  }
}

export class FmpTokenBucket {
  private readonly refillPerMillisecond: number
  private tokens: number
  private lastRefillAt = Date.now()
  private readonly waiters: Waiter[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly config: FmpTokenBucketConfig) {
    if (!Number.isFinite(config.capacity) || config.capacity < 1) {
      throw new RangeError('capacity must be a positive number')
    }
    if (!Number.isFinite(config.refillPerMinute) || config.refillPerMinute <= 0) {
      throw new RangeError('refillPerMinute must be a positive number')
    }
    if (!Number.isInteger(config.maxQueueLength) || config.maxQueueLength < 0) {
      throw new RangeError('maxQueueLength must be a non-negative integer')
    }

    this.tokens = config.capacity
    this.refillPerMillisecond = config.refillPerMinute / 60000
  }

  get pendingCount(): number {
    return this.waiters.length
  }

  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new FmpThrottleAbortedError())

    this.refill()
    if (this.tokens >= 1 && this.waiters.length === 0) {
      this.tokens -= 1
      return Promise.resolve()
    }
    if (this.waiters.length >= this.config.maxQueueLength) {
      return Promise.reject(new FmpThrottleQueueFullError(this.config.maxQueueLength))
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal }
      if (signal) {
        waiter.abortListener = () => this.abortWaiter(waiter)
        signal.addEventListener('abort', waiter.abortListener, { once: true })
      }
      this.waiters.push(waiter)
      this.drain()
    })
  }

  private refill(): void {
    const now = Date.now()
    if (now <= this.lastRefillAt) return
    this.tokens = Math.min(
      this.config.capacity,
      this.tokens + (now - this.lastRefillAt) * this.refillPerMillisecond,
    )
    this.lastRefillAt = now
  }

  private abortWaiter(waiter: Waiter): void {
    const index = this.waiters.indexOf(waiter)
    if (index < 0) return
    this.waiters.splice(index, 1)
    this.removeAbortListener(waiter)
    waiter.reject(new FmpThrottleAbortedError())

    if (this.waiters.length === 0 && this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private removeAbortListener(waiter: Waiter): void {
    if (waiter.signal && waiter.abortListener) {
      waiter.signal.removeEventListener('abort', waiter.abortListener)
    }
  }

  private drain(): void {
    this.refill()
    while (this.tokens >= 1 && this.waiters.length > 0) {
      const waiter = this.waiters.shift()
      if (!waiter) break
      this.removeAbortListener(waiter)
      if (waiter.signal?.aborted) {
        waiter.reject(new FmpThrottleAbortedError())
        continue
      }
      this.tokens -= 1
      waiter.resolve()
    }

    if (this.waiters.length > 0 && !this.timer) {
      const waitMilliseconds = Math.max(
        10,
        Math.ceil((1 - this.tokens) / this.refillPerMillisecond),
      )
      this.timer = setTimeout(() => {
        this.timer = null
        this.drain()
      }, waitMilliseconds)
    }
  }
}

const sharedFmpTokenBucket = new FmpTokenBucket({
  capacity: CAPACITY,
  refillPerMinute: REFILL_PER_MINUTE,
  maxQueueLength: MAX_QUEUE_LENGTH,
})

/** Aguarda autorização local para uma chamada à FMP. */
export function fmpThrottle(signal?: AbortSignal): Promise<void> {
  return sharedFmpTokenBucket.acquire(signal)
}
