import { executeFmpRequest } from '../fmpRequestPolicy'
import {
  FmpInFlightDeduplicator,
  type FmpRequestDeduplicator,
} from '../fmpRequestDeduplicator'

const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'
const FMP_TIMEOUT_MS = 15000

export interface FmpCarteiraClient {
  fetch<T extends object>(
    path: string,
    params?: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<T | null>
}

export interface FmpCarteiraHttpPort {
  get(
    url: string,
    options: {
      readonly params: Readonly<Record<string, string>>
      readonly timeout: number
      readonly signal?: AbortSignal
    },
  ): Promise<{ readonly data: unknown }>
}

export interface FmpCarteiraClientDependencies {
  readonly apiKey: string | undefined
  readonly http: FmpCarteiraHttpPort
  readonly throttle: (signal?: AbortSignal) => Promise<void>
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly deduplicator?: FmpRequestDeduplicator
}

function firstObject<T extends object>(data: unknown): T | null {
  const first = Array.isArray(data) ? data[0] : data
  if (typeof first !== 'object' || first === null || 'Error Message' in first) return null
  return first as T
}

function requestIdentity(path: string, params: Readonly<Record<string, string>>): string {
  const sortedParams = Object.entries(params).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([path, sortedParams])
}

function withoutApiKey(params: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'apikey'))
}

export class AxiosFmpCarteiraClient implements FmpCarteiraClient {
  private readonly deduplicator: FmpRequestDeduplicator

  constructor(private readonly dependencies: FmpCarteiraClientDependencies) {
    this.deduplicator = dependencies.deduplicator ?? new FmpInFlightDeduplicator()
  }

  async fetch<T extends object>(
    path: string,
    params: Readonly<Record<string, string>> = {},
    signal?: AbortSignal,
  ): Promise<T | null> {
    const apiKey = this.dependencies.apiKey
    if (!apiKey) return null
    const requestParams = withoutApiKey(params)

    try {
      const request = () => executeFmpRequest({
        request: () => this.dependencies.http.get(`${FMP_BASE_URL}${path}`, {
          params: { ...requestParams, apikey: apiKey },
          timeout: FMP_TIMEOUT_MS,
          ...(signal ? { signal } : {}),
        }),
        throttle: this.dependencies.throttle,
        sleep: this.dependencies.sleep,
        signal,
      })
      const response = signal
        ? await request()
        : await this.deduplicator.run(requestIdentity(path, requestParams), request)
      return firstObject<T>(response.data)
    } catch {
      return null
    }
  }
}
