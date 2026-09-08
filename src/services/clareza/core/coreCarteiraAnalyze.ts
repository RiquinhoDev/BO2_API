import type { CoreAssetKind } from './coreGeneration.types'

type JsonRecord = Readonly<Record<string, unknown>>

// Porta FMP: devolve os dados ou null em erro (como o fmp_call do PHP,
// que trata falha/HTTP>=400/"Error Message" como null → lista vazia).
export interface CoreCarteiraAnalyzeFmpPort {
  get(path: string, params: Readonly<Record<string, string>>): Promise<unknown>
}

// Cache com TTL (o PHP usa um ficheiro com janela de 6h por ticker; aqui
// o TTL do Redis trata a expiração sozinho, comportamento equivalente).
export interface CoreCarteiraAnalyzeCachePort {
  get(key: string): Promise<CoreCarteiraAnalyzeEntry | null>
  set(key: string, value: CoreCarteiraAnalyzeEntry, ttlSeconds: number): Promise<void>
}

export interface CoreCarteiraAnalyzeEntry {
  readonly income: readonly JsonRecord[]
  readonly incomeGrowth: readonly JsonRecord[]
  readonly earnings: readonly JsonRecord[]
}

export interface CoreCarteiraAnalyzeUniverseItem {
  readonly ticker: string
  readonly kind: CoreAssetKind
}

export interface CoreCarteiraAnalyzeDependencies {
  readonly fmp: CoreCarteiraAnalyzeFmpPort
  readonly cache: CoreCarteiraAnalyzeCachePort
  readonly universe: readonly CoreCarteiraAnalyzeUniverseItem[]
  readonly ttlSeconds: number
}

// Espelha o clareza-carteira-data.php: limite generoso de posições e cache
// de 6 horas (o histórico de resultados não muda durante o dia).
const MAX_ANALYSE = 40
const CACHE_PREFIX = 'clareza:carteira:analyze:'
const VALID_SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,24}$/
const EMPTY: CoreCarteiraAnalyzeEntry = { income: [], incomeGrowth: [], earnings: [] }

const normalize = (value: string): string => value.trim().toUpperCase()

function rows(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => (
      typeof item === 'object' && item !== null && !Array.isArray(item)
    ))
    : []
}

// PHP: explode(",") → strtoupper/trim → array_unique → array_slice(0, MAX).
export function parseCarteiraAnalyzeSymbols(rawSymbols: string): readonly string[] {
  const unique = [...new Set(rawSymbols.split(',').map(normalize).filter(Boolean))]
  return unique.slice(0, MAX_ANALYSE)
}

export async function analyzeCarteiraPortfolio(
  rawSymbols: string,
  dependencies: CoreCarteiraAnalyzeDependencies,
): Promise<{ readonly results: Record<string, CoreCarteiraAnalyzeEntry> }> {
  const symbols = parseCarteiraAnalyzeSymbols(rawSymbols)
  const kindByTicker = new Map(
    dependencies.universe.map(item => [normalize(item.ticker), item.kind]),
  )
  const results: Record<string, CoreCarteiraAnalyzeEntry> = {}

  for (const ticker of symbols) {
    // PHP trata ticker desconhecido como "stock" por defeito; ETFs e cripto
    // não têm resultados trimestrais, por isso devolvem tudo vazio sem
    // sequer chamar a FMP.
    const kind = kindByTicker.get(ticker) ?? 'stock'
    if (kind !== 'stock' || !VALID_SYMBOL.test(ticker)) {
      results[ticker] = EMPTY
      continue
    }

    const key = `${CACHE_PREFIX}${ticker}`
    const cached = await dependencies.cache.get(key)
    if (cached) {
      results[ticker] = cached
      continue
    }

    const [income, incomeGrowth, earnings] = await Promise.all([
      dependencies.fmp.get('/income-statement', { symbol: ticker, period: 'annual', limit: '4' }),
      dependencies.fmp.get('/income-statement-growth', { symbol: ticker, period: 'annual', limit: '4' }),
      dependencies.fmp.get('/earnings', { symbol: ticker, limit: '8' }),
    ])
    const entry: CoreCarteiraAnalyzeEntry = {
      income: rows(income),
      incomeGrowth: rows(incomeGrowth),
      earnings: rows(earnings),
    }
    await dependencies.cache.set(key, entry, dependencies.ttlSeconds)
    results[ticker] = entry
  }

  return { results }
}
