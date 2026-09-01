import type { CoreTop10History, CoreTop10Selection } from './coreTop10Projection'

export interface CoreTop10CompanionFmpPort {
  get(path: string, params: Readonly<Record<string, string>>): Promise<unknown>
}

export interface CoreTop10CompanionCollection {
  readonly generationId: string
  readonly createdAt: Date
  readonly histories: readonly CoreTop10History[]
  readonly errors: readonly { readonly ticker: string; readonly message: string }[]
}

const ymd = (date: Date): string => date.toISOString().slice(0, 10)

export class CoreTop10CompanionCollector {
  constructor(
    private readonly fmp: CoreTop10CompanionFmpPort,
    private readonly selections: readonly CoreTop10Selection[],
    private readonly options: { readonly concurrency: number; readonly now: () => Date },
  ) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 10) {
      throw new RangeError('core Top 10 companion concurrency must be between 1 and 10')
    }
  }

  async collect(generationId: string): Promise<CoreTop10CompanionCollection> {
    if (!generationId.trim()) throw new RangeError('core Top 10 companion generation is required')
    const createdAt = this.options.now()
    const fromDate = new Date(createdAt.getTime())
    fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 5)
    const histories = new Array<CoreTop10History | null>(this.selections.length).fill(null)
    const errors: Array<{ ticker: string; message: string }> = []
    let cursor = 0
    const worker = async () => {
      while (cursor < this.selections.length) {
        const index = cursor++
        const ticker = this.selections[index].canonicalTicker.trim().toUpperCase()
        try {
          const raw = await this.fmp.get('/historical-price-eod/light', {
            symbol: ticker, from: ymd(fromDate), to: ymd(createdAt),
          })
          const points = Array.isArray(raw) ? raw.flatMap(item => {
            if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
            const row = item as Readonly<Record<string, unknown>>
            const close = row.price ?? row.close ?? row.adjClose
            if (typeof row.date !== 'string' || !Number.isFinite(Number(close))) return []
            return [{ date: row.date.slice(0, 10), close: Math.round(Number(close) * 100) / 100 }]
          }).sort((left, right) => left.date.localeCompare(right.date)) : []
          histories[index] = { ticker, points }
        } catch (error: unknown) {
          errors.push({ ticker, message: error instanceof Error ? error.message : 'unknown error' })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, this.selections.length) }, worker))
    return {
      generationId, createdAt,
      histories: histories.flatMap(item => item ? [item] : []),
      errors: errors.sort((left, right) => left.ticker.localeCompare(right.ticker)),
    }
  }
}
