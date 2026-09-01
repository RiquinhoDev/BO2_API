import type { CoreAssetKind } from '../../../src/services/clareza/core/coreGeneration.types'

describe('Clareza core asset kind contract', () => {
  it('models REITs as stock kind and reserves type for the REIT classification', () => {
    const supported: CoreAssetKind[] = ['stock', 'fund', 'crypto']

    // @ts-expect-error REIT is a stock type in the canonical universe, not a kind.
    const invalid: CoreAssetKind = 'reit'

    expect(supported).toEqual(['stock', 'fund', 'crypto'])
    expect(invalid).toBe('reit')
  })
})
