import logger from '../../../utils/logger'
import type { IClarezaCarteiraItem } from '../../../models/ClarezaCarteiraData'
import type { CarteiraItem, CarteiraKind } from './carteiraUniverse'
import type { CarteiraMetricsFetcher, Clock } from './carteiraMetrics'
import type { CarteiraStore } from './carteiraStore'

interface CarteiraSearchResult {
  ticker: string
  name: string
  type: string | null
  kind: CarteiraKind | null
  currency: string | null
}

interface CarteiraSearchResponse {
  query: string
  count: number
  results: CarteiraSearchResult[]
}

interface RankedCarteiraResult {
  rank: number
  result: CarteiraSearchResult
}

export interface CarteiraServiceConfig {
  fmpConfigured: boolean
  cacheTtl: number
  concurrency: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Limits concurrency without adding p-queue to this hot path.
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = []
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

export class ClarezaCarteiraService {
  constructor(
    private readonly fetcher: Pick<CarteiraMetricsFetcher, 'fetchItem'>,
    private readonly store: CarteiraStore,
    private readonly universe: CarteiraItem[],
    private readonly clock: Clock,
    private readonly config: CarteiraServiceConfig,
  ) {}

  async refresh(): Promise<{ total: number; errors: number }> {
    // Fail-closed on missing canonical FMP config — never a real-key fallback.
    if (!this.config.fmpConfigured) {
      throw new Error('FMP_API_KEY nao configurada')
    }

    let errors = 0
    const results = await runWithConcurrency<IClarezaCarteiraItem>(
      this.universe.map((item) => async () => {
        try {
          const data = await this.fetcher.fetchItem(item)
          return { ticker: item.ticker, name: item.name, type: item.type, kind: item.kind, sector: item.sector, data }
        } catch (err: unknown) {
          errors++
          logger.error('[ClarezaCarteira] erro ao buscar ativo', { ticker: item.ticker, error: errorMessage(err) })
          return { ticker: item.ticker, name: item.name, type: item.type, kind: item.kind, sector: item.sector, data: null }
        }
      }),
      this.config.concurrency,
    )

    await this.store.writeCache(results, this.config.cacheTtl)

    try {
      await this.store.saveSnapshot({
        fetchedAt: this.clock.now(),
        itemCount: this.universe.length - errors,
        errors,
        items: results,
      })
    } catch (err: unknown) {
      logger.error('[ClarezaCarteira] erro ao guardar snapshot na BD', { error: errorMessage(err) })
    }

    return { total: this.universe.length, errors }
  }

  async getData(): Promise<IClarezaCarteiraItem[] | null> {
    const cached = await this.store.readCache()
    if (cached) return cached

    try {
      const latest = await this.store.latestSnapshot()
      if (latest) {
        await this.store.writeCache(latest.items, this.config.cacheTtl)
        return latest.items
      }
    } catch (err: unknown) {
      logger.error('[ClarezaCarteira] erro ao ler snapshot da BD', { error: errorMessage(err) })
    }

    return null
  }

  async search(rawQuery: string): Promise<CarteiraSearchResponse> {
    const q = String(rawQuery || '').trim().toUpperCase()
    const cache = await this.getData()
    const ranked = (cache ?? [])
      .map((item): RankedCarteiraResult | null => {
        const ticker = String(item.ticker ?? '')
        const name = String(item.name ?? '')
        const tickerUp = ticker.toUpperCase()
        const nameUp = name.toUpperCase()
        let rank: number | null = null

        if (q === '') rank = 3
        else if (tickerUp === q) rank = 0
        else if (tickerUp.startsWith(q)) rank = 1
        else if (nameUp.startsWith(q)) rank = 2
        else if (tickerUp.includes(q) || nameUp.includes(q)) rank = 3

        if (rank === null) return null
        return {
          rank,
          result: {
            ticker,
            name,
            type: item.type ?? null,
            kind: item.kind ?? null,
            currency: item.data?.currency ?? null,
          },
        }
      })
      .filter((entry): entry is RankedCarteiraResult => entry !== null)
      .sort((a, b) => a.rank - b.rank || a.result.ticker.localeCompare(b.result.ticker))
      .map((entry) => entry.result)

    return { query: q, count: ranked.length, results: ranked.slice(0, 25) }
  }
}
