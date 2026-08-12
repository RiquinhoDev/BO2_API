import { createHash } from 'node:crypto'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { MongoClient, type Document } from 'mongodb'

export type OperationalCommand =
  | { kind: 'syntheticRead'; identity: string; concurrency: number }
  | { kind: 'mongoFindExplain'; identity: string; concurrency: 1 }
  | { kind: 'mongoFindProbe'; identity: string; concurrency: 1 | 10 | 50 }

interface ProbeResult { latenciesMs: number[]; writes: number; executionStats?: Record<string, unknown>; metadata?: Record<string, unknown> }
interface HarnessOptions { env: Record<string, string | undefined>; commands?: OperationalCommand[]; execute?: (command: OperationalCommand) => Promise<ProbeResult> }

const allowedKinds = new Set<OperationalCommand['kind']>(['syntheticRead', 'mongoFindExplain', 'mongoFindProbe'])
const secretKey = /authorization|cookie|password|secret|token|uri|url/i
const secretValue = /(?:mongodb(?:\+srv)?:\/\/|bearer\s+|[a-z]+:\/\/[^\s/]*:[^\s/@]*@)/i

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * ratio) - 1] ?? 0
}

const sanitize = (value: unknown, key = ''): unknown => {
  if (secretKey.test(key)) return '[redacted]'
  if (typeof value === 'string') return secretValue.test(value) ? '[redacted]' : value
  if (Array.isArray(value)) return value.map(entry => sanitize(entry))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([nestedKey, nested]) => [nestedKey, sanitize(nested, nestedKey)]))
  return value
}

const assertAuthorized = (env: HarnessOptions['env']): void => {
  if (env.SCALABILITY_OPERATIONAL_ALLOW_READ_ONLY !== 'true') throw new Error('explicit read-only authorization is required')
  if (env.SCALABILITY_OPERATIONAL_ALLOW_WRITES === 'true') throw new Error('write capability is forbidden')
  const name = env.SCALABILITY_OPERATIONAL_TARGET_NAME ?? ''
  if (!/(?:read[-_ ]?only|nonprod|staging|local|test|fixture)/i.test(name) || /(?:^|[-_ ])prod(?:uction)?(?:$|[-_ ])/i.test(name)) throw new Error('explicitly recognized non-production read-only target is required')
  const kind = env.SCALABILITY_OPERATIONAL_TARGET_KIND
  if (kind !== 'synthetic' && kind !== 'mongodb') throw new Error('target kind must be synthetic or mongodb')
  if (kind === 'mongodb' && env.SCALABILITY_OPERATIONAL_MONGO_READ_ONLY !== 'true') throw new Error('mongodb target requires explicit read-only target authorization')
}

const commandList = (env: HarnessOptions['env']): OperationalCommand[] => {
  const synthetic: OperationalCommand = { kind: 'syntheticRead', identity: 'synthetic-baseline', concurrency: 1 }
  if (env.SCALABILITY_OPERATIONAL_TARGET_KIND !== 'mongodb') return [synthetic]
  const identity = env.SCALABILITY_OPERATIONAL_QUERY_IDENTITY ?? 'authorized-mongo-find'
  return [synthetic, { kind: 'mongoFindExplain', identity, concurrency: 1 }, ...([1, 10, 50] as const).map(concurrency => ({ kind: 'mongoFindProbe' as const, identity, concurrency }))]
}

const parseFilter = (env: HarnessOptions['env']): Document => {
  const parsed: unknown = JSON.parse(env.SCALABILITY_OPERATIONAL_MONGO_FILTER_JSON ?? '{}')
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('mongo filter must be a JSON object')
  if (/\$(?:where|function|accumulator)|\$out|\$merge/i.test(JSON.stringify(parsed))) throw new Error('mongo filter contains a forbidden operator')
  return parsed as Document
}

const defaultExecutor = (env: HarnessOptions['env']) => async (command: OperationalCommand): Promise<ProbeResult> => {
  if (command.kind === 'syntheticRead') {
    const started = performance.now()
    await Promise.resolve()
    return { latenciesMs: [performance.now() - started], writes: 0 }
  }
  const uri = env.SCALABILITY_OPERATIONAL_MONGODB_URI
  const database = env.SCALABILITY_OPERATIONAL_MONGO_DATABASE
  const collectionName = env.SCALABILITY_OPERATIONAL_MONGO_COLLECTION
  if (uri === undefined || database === undefined || collectionName === undefined) throw new Error('mongodb target variables are incomplete')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 })
  try {
    await client.connect()
    const collection = client.db(database).collection(collectionName)
    const filter = parseFilter(env)
    if (command.kind === 'mongoFindExplain') {
      const started = performance.now()
      const explain = await collection.find(filter).limit(100).maxTimeMS(5_000).explain('executionStats')
      return { latenciesMs: [performance.now() - started], writes: 0, executionStats: sanitize(explain) as Record<string, unknown> }
    }
    const reads = Array.from({ length: command.concurrency }, async () => {
      const started = performance.now()
      await collection.find(filter).limit(100).maxTimeMS(5_000).toArray()
      return performance.now() - started
    })
    return { latenciesMs: await Promise.all(reads), writes: 0 }
  } finally { await client.close() }
}

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([operation, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('probe timed out')), timeoutMs) })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}

export const runOperationalValidation = async (options: HarnessOptions) => {
  assertAuthorized(options.env)
  const timeoutMs = Number(options.env.SCALABILITY_OPERATIONAL_TIMEOUT_MS ?? '10000')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('timeout must be between 1 and 120000 milliseconds')
  const commands = options.commands ?? commandList(options.env)
  for (const command of commands) if (!allowedKinds.has(command.kind)) throw new Error('command is not in the read-only allowlist')
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  eventLoop.enable()
  const memoryBefore = process.memoryUsage().heapUsed
  const execute = options.execute ?? defaultExecutor(options.env)
  const results: Array<Record<string, unknown>> = []
  try {
    for (const command of commands) {
      const result = await withTimeout(execute(command), timeoutMs)
      if (result.writes !== 0) throw new Error('zero-write assertion failed')
      results.push(sanitize({ kind: command.kind, identity: command.identity, concurrency: command.concurrency, writes: result.writes, latencyMs: { p50: percentile(result.latenciesMs, 0.50), p95: percentile(result.latenciesMs, 0.95), p99: percentile(result.latenciesMs, 0.99) }, executionStats: result.executionStats, metadata: result.metadata }) as Record<string, unknown>)
    }
  } finally { eventLoop.disable() }
  return sanitize({ schemaVersion: 1, timestamp: new Date().toISOString(), targetFingerprint: createHash('sha256').update(`${options.env.SCALABILITY_OPERATIONAL_TARGET_KIND}:${options.env.SCALABILITY_OPERATIONAL_TARGET_NAME}`).digest('hex').slice(0, 16), targetKind: options.env.SCALABILITY_OPERATIONAL_TARGET_KIND, readOnly: true, metrics: { heapDeltaBytes: process.memoryUsage().heapUsed - memoryBefore, eventLoopDelayMs: { mean: Number.isFinite(eventLoop.mean) ? eventLoop.mean / 1e6 : 0, max: Number.isFinite(eventLoop.max) ? eventLoop.max / 1e6 : 0 } }, results }) as { results: Array<Record<string, unknown> & { identity: string; concurrency: number; writes: number; latencyMs: { p50: number; p95: number; p99: number } }> }
}

if (require.main === module) {
  runOperationalValidation({ env: process.env }).then(evidence => process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown validation error'
    process.stderr.write(`${JSON.stringify({ error: sanitize(message) })}\n`)
    process.exitCode = 1
  })
}
