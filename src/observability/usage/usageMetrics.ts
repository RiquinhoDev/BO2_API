// Nomes das metricas num sitio so. O painel do Front le estas mesmas chaves,
// por isso renomear aqui e uma alteracao de contrato: mudar o nome parte a
// serie historica ja gravada em UsageSnapshot.

export const USAGE_METRICS = {
  /** Pedidos HTTP servidos por nos. Labels: route, method, status. */
  httpRequests: 'http.requests',
  /** Latencia de resposta em ms. Labels: route, method. */
  httpLatency: 'http.latency',
  /** Bytes enviados na resposta — liga direto ao egress que o Railway factura. Labels: route. */
  httpResponseBytes: 'http.response_bytes',

  /** Chamadas a APIs externas. Labels: provider, endpoint, outcome. */
  providerCalls: 'provider.calls',
  /** Latencia dessas chamadas em ms. Labels: provider, endpoint. */
  providerLatency: 'provider.latency',
  /** Tempo em fila no nosso proprio limitador, em ms. Labels: provider. */
  providerThrottleWait: 'provider.throttle_wait',
  /** Chamadas que o deduplicador evitou — poupanca directa de quota. Labels: provider. */
  providerDeduplicated: 'provider.deduplicated',

  /** Operacoes de cache. Labels: op, outcome. */
  cacheOps: 'cache.ops',
  /** Bytes escritos na cache, por prefixo de chave. Labels: prefix. */
  cacheBytesWritten: 'cache.bytes_written',

  /** Comandos enviados a Mongo. Labels: collection, command. */
  mongoCommands: 'mongo.commands',
  /** Duracao desses comandos em ms. Labels: collection, command. */
  mongoLatency: 'mongo.latency',

  /** Execucoes de jobs/cron. Labels: job, outcome. */
  jobRuns: 'job.runs',
  /** Duracao de jobs em ms. Labels: job. */
  jobDuration: 'job.duration',
} as const

export type UsageMetricName = (typeof USAGE_METRICS)[keyof typeof USAGE_METRICS]

/** Fornecedores externos cujo consumo contamos. */
export const USAGE_PROVIDERS = [
  'fmp',
  'hotmart',
  'activecampaign',
  'curseduca',
  'guru',
  'discord',
] as const

export type UsageProvider = (typeof USAGE_PROVIDERS)[number]

export type ProviderOutcome = 'ok' | 'error' | 'rate_limited' | 'timeout'

/** Classe de estado HTTP ("2xx", "4xx", ...) para nao explodir em cardinalidade. */
export function statusClass(status: number): string {
  if (!Number.isFinite(status) || status < 100 || status > 599) return 'unknown'
  return `${Math.floor(status / 100)}xx`
}
