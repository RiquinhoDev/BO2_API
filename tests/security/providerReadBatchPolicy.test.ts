import {
  MAX_PROVIDER_READ_ITEMS,
  assertProviderReadBatchSize,
} from '../../src/security/providerReadBatchPolicy'

describe('provider read batch policy', () => {
  test('uses the existing 20k safety ceiling and accepts the boundary', () => {
    expect(MAX_PROVIDER_READ_ITEMS).toBe(20_000)
    expect(() => assertProviderReadBatchSize(20_000, 'hotmart')).not.toThrow()
  })

  test('fails closed instead of silently truncating above the ceiling', () => {
    expect(() => assertProviderReadBatchSize(20_001, 'hotmart')).toThrow(
      /PROVIDER_READ_BATCH_LIMIT_EXCEEDED/,
    )
  })

  test('rejects invalid cardinalities', () => {
    expect(() => assertProviderReadBatchSize(Number.NaN, 'curseduca')).toThrow(
      /PROVIDER_READ_BATCH_INVALID_COUNT/,
    )
    expect(() => assertProviderReadBatchSize(-1, 'curseduca')).toThrow(
      /PROVIDER_READ_BATCH_INVALID_COUNT/,
    )
  })
})
