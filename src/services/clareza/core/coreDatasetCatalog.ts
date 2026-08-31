import type { CoreAssetKind } from './coreGeneration.types'

export type CoreDatasetConsumer =
  | 'core'
  | 'raiox'
  | 'carteira'
  | 'comparador'
  | 'top10'
  | 'earnings'

export interface CoreDatasetDefinition {
  readonly name: string
  readonly path: string
  readonly assetKinds: readonly CoreAssetKind[]
  readonly consumers: readonly CoreDatasetConsumer[]
  readonly coverage: 'latest' | 'annual-history' | 'price-history' | 'event-history'
}

export const CORE_DATASET_CATALOG = [
  {
    name: 'company-profile', path: '/profile',
    assetKinds: ['stock', 'reit', 'fund'],
    consumers: ['core', 'raiox', 'carteira', 'comparador', 'top10'],
    coverage: 'latest',
  },
  {
    name: 'crypto-quote', path: '/quote',
    assetKinds: ['crypto'], consumers: ['core', 'carteira'], coverage: 'latest',
  },
  {
    name: 'ratios-ttm', path: '/ratios-ttm',
    assetKinds: ['stock', 'reit', 'fund'],
    consumers: ['core', 'raiox', 'carteira', 'comparador', 'top10'],
    coverage: 'latest',
  },
  {
    name: 'key-metrics-ttm', path: '/key-metrics-ttm',
    assetKinds: ['stock', 'reit'],
    consumers: ['core', 'raiox', 'carteira', 'comparador', 'top10'],
    coverage: 'latest',
  },
  {
    name: 'annual-income', path: '/income-statement',
    assetKinds: ['stock', 'reit'],
    consumers: ['core', 'raiox', 'carteira'], coverage: 'annual-history',
  },
  {
    name: 'annual-cash-flow', path: '/cash-flow-statement',
    assetKinds: ['stock', 'reit'],
    consumers: ['core', 'raiox', 'carteira'], coverage: 'annual-history',
  },
  {
    name: 'price-history', path: '/historical-price-eod/light',
    assetKinds: ['stock', 'reit', 'fund', 'crypto'],
    consumers: ['core', 'raiox', 'carteira', 'top10'], coverage: 'price-history',
  },
  {
    name: 'dividends', path: '/dividends',
    assetKinds: ['stock', 'reit', 'fund'],
    consumers: ['core', 'raiox'], coverage: 'event-history',
  },
  {
    name: 'earnings', path: '/earnings',
    assetKinds: ['stock', 'reit'],
    consumers: ['core', 'raiox', 'earnings'], coverage: 'event-history',
  },
  {
    name: 'analyst-consensus', path: '/grades-consensus',
    assetKinds: ['stock', 'reit'],
    consumers: ['core', 'raiox', 'comparador'], coverage: 'latest',
  },
] as const satisfies readonly CoreDatasetDefinition[]

export interface DatasetRequestIdentityInput {
  readonly path: string
  readonly symbol: string
  readonly params?: Readonly<Record<string, string>>
}

export function datasetRequestIdentity(input: DatasetRequestIdentityInput): string {
  if (!input.path.startsWith('/') || input.path.startsWith('//') || input.path.split('/').includes('..')) {
    throw new RangeError('dataset path must be relative')
  }
  const symbol = input.symbol.trim().toUpperCase()
  if (!symbol) throw new RangeError('dataset symbol is required')
  const params = Object.entries(input.params ?? {})
    .filter(([key]) => key.toLowerCase() !== 'apikey')
    .sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify([input.path, symbol, params])
}
