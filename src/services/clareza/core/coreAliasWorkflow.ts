import {
  applyAliasDiscovery,
  selectPendingAliasAssets,
  type CoreAliasDiscovery,
  type CoreAliasState,
  type CoreAliasUniverseAsset,
} from './coreAliasMaintenance'

type JsonRecord = Readonly<Record<string, unknown>>

export interface CoreAliasWorkflowStore {
  read(): Promise<{ readonly revision: number; readonly state: CoreAliasState }>
  replace(state: CoreAliasState, expectedRevision: number): Promise<number>
}

export interface CoreAliasWorkflowFmp {
  get(path: string, params: Readonly<Record<string, string>>): Promise<unknown>
}

interface CoreAliasWorkflowDependencies {
  readonly store: CoreAliasWorkflowStore
  readonly fmp: CoreAliasWorkflowFmp
  readonly universe: readonly CoreAliasUniverseAsset[]
  readonly now: () => string
}

const record = (value: unknown): JsonRecord | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : null
)
const normalize = (value: string): string => value.trim().toUpperCase()

function discoveryFromResponse(ticker: string, value: unknown, observedAt: string): CoreAliasDiscovery {
  const rows = Array.isArray(value) ? value.map(record).filter((row): row is JsonRecord => row !== null) : []
  let canonical: JsonRecord | null = null
  for (const row of rows) {
    if (typeof row.symbol === 'string' && normalize(row.symbol) === normalize(ticker)) {
      canonical = row
      break
    }
  }
  const instrumentId = typeof canonical?.isin === 'string' && canonical.isin.trim() ? canonical.isin.trim() : null
  // A FMP respondeu — não há erro de transporte nenhum a repetir. Só não achou
  // uma linha própria com ISIN para este ticker (resposta vazia, ou nenhuma
  // linha corresponde ao símbolo pedido). É uma resposta definitiva: sem
  // variantes conhecidas, processado na mesma. Tal como o PHP de origem
  // (clareza-carteira-data.php) marca sempre o ticker como processado, tenha
  // ou não encontrado nada — só assim o lote seguinte avança em vez de ficar
  // preso a tentar sempre os mesmos primeiros itens.
  if (!instrumentId) {
    return { canonicalTicker: ticker, instrumentId: null, status: 'success', variants: [], observedAt }
  }
  return {
    canonicalTicker: ticker,
    instrumentId,
    status: 'success',
    observedAt,
    variants: rows.map(row => ({
      ticker: typeof row.symbol === 'string' ? row.symbol : '',
      instrumentId: typeof row.isin === 'string' && row.isin.trim() ? row.isin.trim() : null,
    })),
  }
}

export function createCoreAliasWorkflow(dependencies: CoreAliasWorkflowDependencies) {
  return async (input: { readonly limit: number; readonly tickers?: readonly string[] }) => {
    const snapshot = await dependencies.store.read()
    const pending = selectPendingAliasAssets(
      dependencies.universe, snapshot.state, input.limit, input.tickers ?? [],
    )
    let state = snapshot.state
    let aliasesAdded = 0
    let failures = 0
    let conflicts = 0
    for (const asset of pending) {
      const observedAt = dependencies.now()
      let discovery: CoreAliasDiscovery
      try {
        const response = await dependencies.fmp.get('/search-exchange-variants', { symbol: asset.ticker })
        discovery = discoveryFromResponse(asset.ticker, response, observedAt)
      } catch {
        discovery = {
          canonicalTicker: asset.ticker, instrumentId: null, status: 'retryable-failure',
          variants: [], observedAt,
        }
      }
      const result = applyAliasDiscovery(state, dependencies.universe, discovery)
      aliasesAdded += result.state.aliases.length - state.aliases.length
      failures += discovery.status === 'retryable-failure' ? 1 : 0
      conflicts += result.conflicts.length
      state = result.state
    }
    if (!pending.length) {
      return { status: 'noop' as const, revision: snapshot.revision, processed: 0, aliasesAdded: 0, failures: 0, conflicts: 0, remaining: 0 }
    }
    const revision = await dependencies.store.replace(state, snapshot.revision)
    const remaining = selectPendingAliasAssets(dependencies.universe, state, Number.MAX_SAFE_INTEGER).length
    return {
      status: 'published' as const, revision, processed: pending.length,
      aliasesAdded, failures, conflicts, remaining,
    }
  }
}
