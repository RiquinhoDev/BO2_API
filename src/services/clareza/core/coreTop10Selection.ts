import type { CoreTop10Selection } from './coreTop10Projection'

export const CORE_TOP10_REVISION = 'Q2 2026'

export const CORE_TOP10_SELECTIONS: readonly CoreTop10Selection[] = Object.freeze([
  { key: 'MU', canonicalTicker: 'MU', currency: '$' },
  { key: 'GOOGL', canonicalTicker: 'GOOGL', currency: '$' },
  { key: 'TSM', canonicalTicker: 'TSM', currency: '$' },
  { key: 'NVDA', canonicalTicker: 'NVDA', currency: '$' },
  { key: 'PLTR', canonicalTicker: 'PLTR', currency: '$' },
  { key: 'ASML', canonicalTicker: 'ASML.AS', currency: '€' },
  { key: 'META', canonicalTicker: 'META', currency: '$' },
  { key: 'FERRARI', canonicalTicker: 'RACE.MI', currency: '€' },
  { key: 'NBIS', canonicalTicker: 'NBIS', currency: '$' },
  { key: 'SPCX', canonicalTicker: 'SPCX', currency: '$' },
])
