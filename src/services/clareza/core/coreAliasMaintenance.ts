import type { CoreAssetKind } from './coreGeneration.types'

export interface CoreAliasUniverseAsset {
  readonly ticker: string
  readonly kind: CoreAssetKind
}

export interface CoreAliasRecord {
  readonly aliasTicker: string
  readonly canonicalTicker: string
  readonly instrumentId: string
  readonly provenance: 'fmp-exchange-variants'
  readonly observedAt: string
}

export interface CoreAliasState {
  readonly aliases: readonly CoreAliasRecord[]
  readonly processed: readonly { readonly ticker: string; readonly processedAt: string }[]
  readonly failures: readonly { readonly ticker: string; readonly reason: string; readonly observedAt: string }[]
  readonly conflicts: readonly {
    readonly aliasTicker: string
    readonly existingCanonicalTicker: string
    readonly proposedCanonicalTicker: string
    readonly observedAt: string
  }[]
}

export interface CoreAliasDiscovery {
  readonly canonicalTicker: string
  readonly instrumentId: string | null
  readonly status: 'success' | 'retryable-failure'
  readonly variants: readonly { readonly ticker: string; readonly instrumentId: string | null }[]
  readonly observedAt: string
}

export interface CoreAliasMaintenanceResult {
  readonly state: CoreAliasState
  readonly rejected: readonly {
    readonly aliasTicker: string
    readonly reason: 'canonical-ticker-precedence' | 'instrument-mismatch'
  }[]
  readonly conflicts: readonly {
    readonly aliasTicker: string
    readonly existingCanonicalTicker: string
    readonly proposedCanonicalTicker: string
  }[]
}

const normalize = (ticker: string): string => ticker.trim().toUpperCase()

export function reconcileAliasState(
  state: CoreAliasState,
  universe: readonly CoreAliasUniverseAsset[],
): CoreAliasState {
  const canonicalTickers = new Set(universe.map(asset => normalize(asset.ticker)))
  return {
    aliases: state.aliases.filter(alias => canonicalTickers.has(normalize(alias.canonicalTicker))),
    processed: state.processed.filter(item => canonicalTickers.has(normalize(item.ticker))),
    failures: state.failures.filter(item => canonicalTickers.has(normalize(item.ticker))),
    conflicts: state.conflicts.filter(item => canonicalTickers.has(normalize(item.proposedCanonicalTicker))),
  }
}

export function selectPendingAliasAssets(
  universe: readonly CoreAliasUniverseAsset[],
  state: CoreAliasState,
  limit: number,
  requestedTickers: readonly string[] = [],
): readonly CoreAliasUniverseAsset[] {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('alias batch limit must be a positive integer')
  const reconciled = reconcileAliasState(state, universe)
  const processed = new Set(reconciled.processed.map(item => normalize(item.ticker)))
  const requested = new Set(requestedTickers.map(normalize))
  return universe
    .filter(asset => asset.kind === 'fund')
    .filter(asset => !processed.has(normalize(asset.ticker)) || requested.has(normalize(asset.ticker)))
    .sort((left, right) => Number(requested.has(normalize(right.ticker))) - Number(requested.has(normalize(left.ticker))))
    .slice(0, limit)
}

export function applyAliasDiscovery(
  state: CoreAliasState,
  universe: readonly CoreAliasUniverseAsset[],
  discovery: CoreAliasDiscovery,
): CoreAliasMaintenanceResult {
  const reconciled = reconcileAliasState(state, universe)
  const canonicalTicker = normalize(discovery.canonicalTicker)
  const canonical = universe.find(asset => normalize(asset.ticker) === canonicalTicker)
  if (!canonical || canonical.kind !== 'fund') {
    throw new RangeError('alias discovery canonical asset is not eligible')
  }
  if (discovery.status === 'retryable-failure') {
    const failures = [
      ...reconciled.failures.filter(item => normalize(item.ticker) !== canonicalTicker),
      { ticker: canonicalTicker, reason: 'provider-unavailable-or-identity-missing', observedAt: discovery.observedAt },
    ]
    return { state: { ...reconciled, failures }, rejected: [], conflicts: [] }
  }
  if (!discovery.instrumentId) throw new RangeError('alias discovery instrument identity is required')
  const universeTickers = new Set(universe.map(asset => normalize(asset.ticker)))
  const aliases = [...reconciled.aliases]
  const rejected: CoreAliasMaintenanceResult['rejected'][number][] = []
  const conflicts: CoreAliasMaintenanceResult['conflicts'][number][] = []
  for (const variant of discovery.variants) {
    const aliasTicker = normalize(variant.ticker)
    if (!aliasTicker || aliasTicker === canonicalTicker) continue
    if (universeTickers.has(aliasTicker)) {
      rejected.push({ aliasTicker, reason: 'canonical-ticker-precedence' })
      continue
    }
    if (!variant.instrumentId || variant.instrumentId !== discovery.instrumentId) {
      rejected.push({ aliasTicker, reason: 'instrument-mismatch' })
      continue
    }
    const existing = aliases.find(alias => normalize(alias.aliasTicker) === aliasTicker)
    if (existing && normalize(existing.canonicalTicker) !== canonicalTicker) {
      conflicts.push({
        aliasTicker,
        existingCanonicalTicker: normalize(existing.canonicalTicker),
        proposedCanonicalTicker: canonicalTicker,
      })
      continue
    }
    if (!existing) aliases.push({
      aliasTicker,
      canonicalTicker,
      instrumentId: discovery.instrumentId,
      provenance: 'fmp-exchange-variants',
      observedAt: discovery.observedAt,
    })
  }
  const processed = reconciled.processed.some(item => normalize(item.ticker) === canonicalTicker)
    ? [...reconciled.processed]
    : [...reconciled.processed, { ticker: canonicalTicker, processedAt: discovery.observedAt }]
  const conflictKey = (conflict: {
    readonly aliasTicker: string
    readonly existingCanonicalTicker: string
    readonly proposedCanonicalTicker: string
  }): string => [
    normalize(conflict.aliasTicker),
    normalize(conflict.existingCanonicalTicker),
    normalize(conflict.proposedCanonicalTicker),
  ].join(':')
  const newConflictKeys = new Set(conflicts.map(conflictKey))
  const persistedConflicts = [
    ...reconciled.conflicts.filter(conflict => !newConflictKeys.has(conflictKey(conflict))),
    ...conflicts.map(conflict => ({ ...conflict, observedAt: discovery.observedAt })),
  ]
  const failures = reconciled.failures.filter(item => normalize(item.ticker) !== canonicalTicker)
  return { state: { aliases, processed, failures, conflicts: persistedConflicts }, rejected, conflicts }
}
