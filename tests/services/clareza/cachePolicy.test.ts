import { CLAREZA_DAILY_CACHE_TTL_SECONDS } from '../../../src/services/clareza/cachePolicy'

test('keeps daily Clareza data for two refresh windows', () => {
  expect(CLAREZA_DAILY_CACHE_TTL_SECONDS).toBe(48 * 60 * 60)
  expect(CLAREZA_DAILY_CACHE_TTL_SECONDS).toBeGreaterThan(24 * 60 * 60)
})
