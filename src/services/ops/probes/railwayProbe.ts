// Consumo facturavel no Railway. E a unica fonte que fala em dinheiro, por isso
// alimenta a parte do painel que a chefia le primeiro.
//
// A API publica do Railway e GraphQL e o esquema muda sem aviso. Tratamos
// qualquer falha como "indisponivel" em vez de partir o snapshot inteiro: o
// resto das medicoes nao depende do Railway estar de bom humor.

import axios from 'axios'

export const RAILWAY_API_URL = 'https://backboard.railway.com/graphql/v2'

/** Medidas que o Railway factura. Os nomes sao do enum `MetricMeasurement`. */
export const RAILWAY_MEASUREMENTS = [
  'CPU_USAGE',
  'MEMORY_USAGE_GB',
  'NETWORK_TX_GB',
  'DISK_USAGE_GB',
] as const

export interface RailwayMeasurement {
  readonly measurement: string
  readonly value: number
}

export interface RailwayUsage {
  readonly available: true
  readonly periodStart: string
  readonly periodEnd: string
  readonly measurements: readonly RailwayMeasurement[]
  /** Custo estimado do ciclo em USD, quando o Railway o devolve. */
  readonly estimatedCostUsd: number | null
}

export interface RailwayUnavailable {
  readonly available: false
  readonly reason: string
}

export type RailwayProbeResult = RailwayUsage | RailwayUnavailable

export interface RailwayProbeConfig {
  readonly token: string
  readonly projectId: string
  readonly apiUrl?: string
  readonly timeoutMs?: number
}

export interface RailwayHttpPort {
  post(
    url: string,
    body: unknown,
    options: {
      readonly headers: Readonly<Record<string, string>>
      readonly timeout: number
    },
  ): Promise<{ readonly data: unknown }>
}

const USAGE_QUERY = `
query usage($projectId: String!, $startDate: DateTime!, $endDate: DateTime!, $measurements: [MetricMeasurement!]!) {
  usage(
    projectId: $projectId
    startDate: $startDate
    endDate: $endDate
    measurements: $measurements
  ) {
    measurement
    value
    estimatedValue
  }
}`

export const defaultRailwayHttpPort: RailwayHttpPort = {
  post: (url, body, options) => axios.post(url, body, options),
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function firstGraphqlError(payload: Record<string, unknown>): string | null {
  const errors = payload.errors
  if (!Array.isArray(errors) || errors.length === 0) return null
  const first = asRecord(errors[0])
  const message = first?.message
  return typeof message === 'string' ? message : 'erro GraphQL sem mensagem'
}

/** Inicio do mes corrente em UTC — o Railway factura por ciclo mensal. */
export function currentBillingWindow(now: Date = new Date()): {
  start: string
  end: string
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { start: start.toISOString(), end: now.toISOString() }
}

export async function probeRailway(
  config: RailwayProbeConfig,
  port: RailwayHttpPort = defaultRailwayHttpPort,
  now: Date = new Date(),
): Promise<RailwayProbeResult> {
  const window = currentBillingWindow(now)

  let payload: Record<string, unknown> | null
  try {
    const response = await port.post(
      config.apiUrl ?? RAILWAY_API_URL,
      {
        query: USAGE_QUERY,
        variables: {
          projectId: config.projectId,
          startDate: window.start,
          endDate: window.end,
          measurements: [...RAILWAY_MEASUREMENTS],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        timeout: config.timeoutMs ?? 15_000,
      },
    )
    payload = asRecord(response.data)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'falha desconhecida'
    return { available: false, reason }
  }

  if (!payload) return { available: false, reason: 'resposta do Railway ilegivel' }

  const graphqlError = firstGraphqlError(payload)
  if (graphqlError) return { available: false, reason: graphqlError }

  const usage = asRecord(payload.data)?.usage
  if (!Array.isArray(usage)) {
    return { available: false, reason: 'resposta do Railway sem campo usage' }
  }

  const measurements: RailwayMeasurement[] = []
  let estimatedCostUsd: number | null = null

  for (const raw of usage) {
    const entry = asRecord(raw)
    if (!entry) continue
    const measurement = typeof entry.measurement === 'string' ? entry.measurement : null
    const value = typeof entry.value === 'number' ? entry.value : null
    if (measurement === null || value === null) continue
    measurements.push({ measurement, value })
    if (typeof entry.estimatedValue === 'number') {
      estimatedCostUsd = (estimatedCostUsd ?? 0) + entry.estimatedValue
    }
  }

  return {
    available: true,
    periodStart: window.start,
    periodEnd: window.end,
    measurements,
    estimatedCostUsd,
  }
}
