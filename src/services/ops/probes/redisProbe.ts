// Fotografia do Redis. Os contadores do INFO (evicted_keys, keyspace_hits...)
// sao acumulados desde o arranque do servidor, por isso guardamos tambem
// `uptimeSeconds`: quando o uptime desce, o Redis reiniciou e a diferenca entre
// snapshots nao pode ser lida como consumo.

import type { RedisDiagnosticsPort } from '../../cache.service'

export interface RedisUsage {
  readonly usedMemoryBytes: number
  readonly usedMemoryRssBytes: number
  readonly maxMemoryBytes: number
  readonly maxMemoryPolicy: string
  readonly fragmentationRatio: number
  readonly keys: number
  readonly connectedClients: number
  readonly uptimeSeconds: number
  /** Acumulados desde o arranque do Redis. */
  readonly evictedKeys: number
  readonly expiredKeys: number
  readonly keyspaceHits: number
  readonly keyspaceMisses: number
  readonly totalCommands: number
}

export interface RedisPrefixUsage {
  readonly prefix: string
  readonly sampledKeys: number
  readonly sampledBytes: number
  /** Bytes estimados para o total de chaves do prefixo, extrapolando a amostra. */
  readonly estimatedBytes: number
  readonly totalKeys: number
}

function parseInfo(raw: string): Readonly<Record<string, string>> {
  const values: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1)
  }
  return values
}

function numeric(values: Readonly<Record<string, string>>, field: string): number {
  const parsed = Number(values[field])
  return Number.isFinite(parsed) ? parsed : 0
}

export async function probeRedis(port: RedisDiagnosticsPort): Promise<RedisUsage> {
  const values = parseInfo(await port.info())
  const keys = await port.dbSize()

  return {
    usedMemoryBytes: numeric(values, 'used_memory'),
    usedMemoryRssBytes: numeric(values, 'used_memory_rss'),
    maxMemoryBytes: numeric(values, 'maxmemory'),
    maxMemoryPolicy: values.maxmemory_policy ?? 'unknown',
    fragmentationRatio: numeric(values, 'mem_fragmentation_ratio'),
    keys,
    connectedClients: numeric(values, 'connected_clients'),
    uptimeSeconds: numeric(values, 'uptime_in_seconds'),
    evictedKeys: numeric(values, 'evicted_keys'),
    expiredKeys: numeric(values, 'expired_keys'),
    keyspaceHits: numeric(values, 'keyspace_hits'),
    keyspaceMisses: numeric(values, 'keyspace_misses'),
    totalCommands: numeric(values, 'total_commands_processed'),
  }
}

/**
 * Quanto pesa cada familia de chaves. Medir chave a chave um dataset inteiro
 * seria pior do que o problema que estamos a diagnosticar, por isso medimos uma
 * amostra e extrapolamos pelo numero total de chaves do prefixo.
 */
export async function probeRedisPrefixes(
  port: RedisDiagnosticsPort,
  prefixes: readonly string[],
  sampleSize = 50,
): Promise<readonly RedisPrefixUsage[]> {
  const usages: RedisPrefixUsage[] = []

  for (const prefix of prefixes) {
    const pattern = `${prefix}*`
    let totalKeys: number
    try {
      totalKeys = (await port.sampleKeys(pattern, 5_000)).length
    } catch {
      continue
    }

    const sample = totalKeys <= sampleSize
      ? await port.sampleKeys(pattern, totalKeys)
      : await port.sampleKeys(pattern, sampleSize)

    let sampledBytes = 0
    let sampledKeys = 0
    for (const key of sample) {
      try {
        const bytes = await port.memoryUsage(key)
        if (bytes === null) continue
        sampledBytes += bytes
        sampledKeys += 1
      } catch {
        // MEMORY USAGE pode nao existir em Redis antigos; o prefixo fica sem estimativa.
      }
    }

    usages.push({
      prefix,
      sampledKeys,
      sampledBytes,
      estimatedBytes: sampledKeys === 0
        ? 0
        : Math.round((sampledBytes / sampledKeys) * totalKeys),
      totalKeys,
    })
  }

  return usages.sort((left, right) => right.estimatedBytes - left.estimatedBytes)
}
