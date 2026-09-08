import { executeFmpRequest } from './fmpRequestPolicy'
import {
  FmpInFlightDeduplicator,
  type FmpRequestDeduplicator,
} from './fmpRequestDeduplicator'

export const FMP_STABLE_BASE_URL = 'https://financialmodelingprep.com/stable'
export const FMP_V3_BASE_URL = 'https://financialmodelingprep.com/api/v3'
const ALLOWED_BASE_URLS = new Set([FMP_STABLE_BASE_URL, FMP_V3_BASE_URL])
const DEFAULT_TIMEOUT_MS = 15000
const MAX_TIMEOUT_MS = 30000

export interface FmpJsonHttpPort {
  get(
    url: string,
    options: {
      readonly params: Readonly<Record<string, string>>
      readonly timeout: number
      readonly signal?: AbortSignal
    },
  ): Promise<{ readonly data: unknown }>
}

export interface FmpJsonClientDependencies {
  readonly getApiKey: () => string | undefined
  readonly http: FmpJsonHttpPort
  readonly throttle: (signal?: AbortSignal) => Promise<void>
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly deduplicator?: FmpRequestDeduplicator
}

export interface FmpJsonRequest {
  readonly baseUrl: string
  readonly path: string
  readonly params?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

function requestUrl(baseUrl: string, path: string): string {
  if (!ALLOWED_BASE_URLS.has(baseUrl)) throw new RangeError('FMP base URL is not allowed')
  if (!path.startsWith('/') || path.startsWith('//') || path.split('/').includes('..')) {
    throw new RangeError('FMP path must be relative')
  }
  return `${baseUrl}${path}`
}

function requestTimeout(timeoutMs: number | undefined): number {
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_MS) {
    throw new RangeError(`FMP timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds`)
  }
  return timeout
}

function withoutApiKey(params: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'apikey'))
}

function requestIdentity(
  url: string,
  params: Readonly<Record<string, string>>,
  timeout: number,
): string {
  const sortedParams = Object.entries(params).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([url, sortedParams, timeout])
}

export class FmpJsonClient {
  private readonly deduplicator: FmpRequestDeduplicator

  constructor(private readonly dependencies: FmpJsonClientDependencies) {
    this.deduplicator = dependencies.deduplicator ?? new FmpInFlightDeduplicator()
  }

  async get(request: FmpJsonRequest): Promise<unknown | null> {
    const execute = this.prepare(request)
    if (!execute) return null

    try {
      return await execute()
    } catch {
      return null
    }
  }

  async getOrThrow(request: FmpJsonRequest): Promise<unknown | null> {
    const execute = this.prepare(request)
    return execute ? execute() : null
  }

  private prepare(request: FmpJsonRequest): (() => Promise<unknown>) | null {
    const url = requestUrl(request.baseUrl, request.path)
    const timeout = requestTimeout(request.timeoutMs)
    const apiKey = this.dependencies.getApiKey()
    if (!apiKey) return null
    const requestParams = withoutApiKey(request.params ?? {})

    return async () => {
      const execute = () => executeFmpRequest({
        request: () => this.dependencies.http.get(url, {
          params: { ...requestParams, apikey: apiKey },
          timeout,
          ...(request.signal ? { signal: request.signal } : {}),
        }),
        throttle: this.dependencies.throttle,
        sleep: this.dependencies.sleep,
        signal: request.signal,
      })
      const response = request.signal
        ? await execute()
        : await this.deduplicator.run(requestIdentity(url, requestParams, timeout), execute)
      return response.data
    }
  }
}
