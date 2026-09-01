import type { ClarezaAsset } from '../universe/clarezaUniverse.types'
import type { CoreEarningsEvent, CoreEarningsSeries } from './coreEarningsProjection'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreEarningsCompanionFmpPort {
  get(path: string, params: Readonly<Record<string, string>>): Promise<unknown>
}

export interface CoreEarningsCompanionCollection {
  readonly generationId: string
  readonly createdAt: Date
  readonly series: readonly CoreEarningsSeries[]
  readonly errors: readonly { readonly ticker: string; readonly message: string }[]
}

interface CoreEarningsCompanionCollectorOptions {
  readonly concurrency: number
  readonly now: () => Date
}

const normalize = (ticker: string): string => ticker.trim().toUpperCase()
const record = (value: unknown): JsonRecord | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : null
)

function event(value: unknown): CoreEarningsEvent | null {
  const row = record(value)
  if (!row || typeof row.date !== 'string') return null
  return {
    date: row.date.slice(0, 10),
    epsEstimated: typeof row.epsEstimated === 'number' || typeof row.epsEstimated === 'string'
      ? row.epsEstimated : null,
    epsActual: typeof row.epsActual === 'number' || typeof row.epsActual === 'string'
      ? row.epsActual : null,
    reportedEPS: typeof row.reportedEPS === 'number' || typeof row.reportedEPS === 'string'
      ? row.reportedEPS : null,
  }
}

export class CoreEarningsCompanionCollector {
  constructor(
    private readonly fmp: CoreEarningsCompanionFmpPort,
    private readonly universe: readonly ClarezaAsset[],
    private readonly options: CoreEarningsCompanionCollectorOptions,
  ) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 20) {
      throw new RangeError('core Earnings companion concurrency must be between 1 and 20')
    }
  }

  async collect(generationId: string): Promise<CoreEarningsCompanionCollection> {
    if (!generationId.trim()) throw new RangeError('core Earnings companion generation is required')
    const eligible = this.universe.filter(asset => asset.kind === 'stock')
    const series = new Array<CoreEarningsSeries | null>(eligible.length).fill(null)
    const errors: Array<{ ticker: string; message: string }> = []
    let cursor = 0
    const worker = async () => {
      while (cursor < eligible.length) {
        const index = cursor++
        const ticker = normalize(eligible[index].ticker)
        try {
          const raw = await this.fmp.get('/earnings', { symbol: ticker, limit: '8' })
          const events = Array.isArray(raw) ? raw.flatMap(item => {
            const parsed = event(item)
            return parsed ? [parsed] : []
          }) : []
          series[index] = { ticker, events }
        } catch (error: unknown) {
          errors.push({ ticker, message: error instanceof Error ? error.message : 'unknown error' })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, eligible.length) }, worker))
    return {
      generationId,
      createdAt: this.options.now(),
      series: series.flatMap(item => item ? [item] : []),
      errors: errors.sort((left, right) => left.ticker.localeCompare(right.ticker)),
    }
  }
}
