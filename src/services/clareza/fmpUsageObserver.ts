// Ligacao entre o cliente FMP e o contador de consumo. Fica separada para o
// cliente continuar a poder ser instanciado nos testes sem medir nada.

import { countUsage, observeUsage } from '../../observability/usage/usageMeter'
import { USAGE_METRICS, type ProviderOutcome } from '../../observability/usage/usageMetrics'

export interface FmpUsageObserver {
  onCall(event: {
    endpoint: string
    outcome: ProviderOutcome
    durationMs: number
  }): void
  onDeduplicated(event: { endpoint: string }): void
  classify(error: unknown): ProviderOutcome
}

/**
 * Primeiro segmento do caminho. `/historical-price-full/AAPL` e
 * `/historical-price-full/MSFT` sao o mesmo endpoint para efeitos de quota;
 * guardar o simbolo criava uma serie por empresa e enchia o snapshot.
 */
export function fmpEndpointLabel(path: string): string {
  const segment = path.split('/').filter(Boolean)[0]
  return segment ? `/${segment}` : '/'
}

function responseStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const response = (error as { response?: unknown }).response
  if (typeof response !== 'object' || response === null) return null
  const status = (response as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export function classifyProviderError(error: unknown): ProviderOutcome {
  const status = responseStatus(error)
  if (status === 429) return 'rate_limited'
  if (status === 408) return 'timeout'

  const code = errorCode(error)
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return 'timeout'

  return 'error'
}

export const defaultFmpUsageObserver: FmpUsageObserver = {
  onCall: ({ endpoint, outcome, durationMs }) => {
    countUsage(USAGE_METRICS.providerCalls, { provider: 'fmp', endpoint, outcome })
    observeUsage(USAGE_METRICS.providerLatency, durationMs, { provider: 'fmp', endpoint })
  },
  onDeduplicated: ({ endpoint }) => {
    countUsage(USAGE_METRICS.providerDeduplicated, { provider: 'fmp', endpoint })
  },
  classify: classifyProviderError,
}
