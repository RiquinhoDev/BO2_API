const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 2000

// Tecto para a espera depois de um 429. Um Retry-After absurdo vindo do
// fornecedor nao pode prender um job durante horas.
const MAX_RATE_LIMIT_WAIT_MS = 90_000

// Folga depois da viragem do minuto: a janela do fornecedor e o nosso relogio
// nao estao sincronizados ao milissegundo, e voltar cedo demais gasta uma
// tentativa para levar outro 429.
const MINUTE_BOUNDARY_GRACE_MS = 1_000

type JsonObject = Readonly<Record<string, unknown>>

export interface FmpRequestPolicyOptions<T> {
  readonly request: () => Promise<T>
  readonly throttle: (signal?: AbortSignal) => Promise<void>
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly signal?: AbortSignal
  readonly maxAttempts?: number
  readonly retryDelayMs?: number
  readonly now?: () => number
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

function responseHeader(error: unknown, name: string): string | null {
  if (!isJsonObject(error) || !isJsonObject(error.response)) return null
  const headers = error.response.headers
  if (!isJsonObject(headers)) return null
  const value = headers[name] ?? headers[name.toLowerCase()]
  if (typeof value === 'string') return value
  return typeof value === 'number' ? String(value) : null
}

/**
 * Quanto esperar depois de um 429. A quota da FMP e por minuto, por isso os
 * 2 segundos fixos do retry generico nao servem: as tres tentativas caiam todas
 * dentro do mesmo minuto que ja nos recusou, e a chamada morria com dados por
 * ir buscar. Preferimos o `Retry-After` quando existe e, quando nao existe,
 * esperamos pela viragem do minuto.
 */
export function rateLimitWaitMs(error: unknown, nowMs: number): number {
  const header = responseHeader(error, 'retry-after')
  if (header !== null) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, MAX_RATE_LIMIT_WAIT_MS)
    }
    const until = Date.parse(header)
    if (!Number.isNaN(until)) {
      return Math.min(Math.max(until - nowMs, 0), MAX_RATE_LIMIT_WAIT_MS)
    }
  }

  const intoMinute = nowMs % 60_000
  return 60_000 - intoMinute + MINUTE_BOUNDARY_GRACE_MS
}

function isRateLimited(error: unknown): boolean {
  return responseStatus(error) === 429
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
  const now = options.now ?? Date.now
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer')
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new RangeError('retryDelayMs must be a non-negative number')
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(options.signal)
    await options.throttle(options.signal)
    throwIfAborted(options.signal)

    try {
      return await options.request()
    } catch (error: unknown) {
      if (!isRetryable(error) || attempt === maxAttempts) throw error
      const waitMs = isRateLimited(error)
        ? rateLimitWaitMs(error, now())
        : retryDelayMs
      await waitForRetry(options.sleep, waitMs, options.signal)
    }
  }

  throw new Error('FMP request policy exhausted unexpectedly')
}
