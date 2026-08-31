const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 2000

type JsonObject = Readonly<Record<string, unknown>>

export interface FmpRequestPolicyOptions<T> {
  readonly request: () => Promise<T>
  readonly throttle: () => Promise<void>
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly signal?: AbortSignal
  readonly maxAttempts?: number
  readonly retryDelayMs?: number
}

export class FmpRequestAbortedError extends Error {
  constructor() {
    super('FMP request aborted')
    this.name = 'FmpRequestAbortedError'
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseStatus(error: unknown): number | null {
  if (!isJsonObject(error) || !isJsonObject(error.response)) return null
  return typeof error.response.status === 'number' ? error.response.status : null
}

function isRetryable(error: unknown): boolean {
  const status = responseStatus(error)
  if (status === 408 || status === 429 || (status !== null && status >= 500 && status <= 599)) {
    return true
  }

  if (!isJsonObject(error)) return false
  return error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED'
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new FmpRequestAbortedError()
}

async function waitForRetry(
  sleep: (milliseconds: number) => Promise<void>,
  milliseconds: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfAborted(signal)
  if (!signal) {
    await sleep(milliseconds)
    return
  }

  let abortListener: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    abortListener = () => reject(new FmpRequestAbortedError())
    signal.addEventListener('abort', abortListener, { once: true })
  })

  try {
    await Promise.race([sleep(milliseconds), aborted])
  } finally {
    if (abortListener) signal.removeEventListener('abort', abortListener)
  }
  throwIfAborted(signal)
}

export async function executeFmpRequest<T>(options: FmpRequestPolicyOptions<T>): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer')
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new RangeError('retryDelayMs must be a non-negative number')
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(options.signal)
    await options.throttle()
    throwIfAborted(options.signal)

    try {
      return await options.request()
    } catch (error: unknown) {
      if (!isRetryable(error) || attempt === maxAttempts) throw error
      await waitForRetry(options.sleep, retryDelayMs, options.signal)
    }
  }

  throw new Error('FMP request policy exhausted unexpectedly')
}
