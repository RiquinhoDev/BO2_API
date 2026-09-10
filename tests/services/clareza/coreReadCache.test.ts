import { cacheService } from '../../../src/services/cache.service'
import {
  normalizeQueryKey,
  normalizeSymbolKey,
  withCoreCache,
} from '../../../src/services/clareza/core/coreReadCache'

const STABLE_TTL = 7 * 24 * 60 * 60

afterEach(() => {
  jest.restoreAllMocks()
})

describe('withCoreCache', () => {
  it('computes and stores on a miss, under the prefixed key and a last-good key', async () => {
    jest.spyOn(cacheService, 'get').mockResolvedValue(null)
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async () => ({ generationId: 'g1' }))

    const wrapped = withCoreCache('radar', 3600, () => 'all', compute)
    await expect(wrapped()).resolves.toEqual({ generationId: 'g1' })

    expect(compute).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledWith('clareza:core:radar:all', { generationId: 'g1' }, 3600)
    expect(setSpy).toHaveBeenCalledWith(
      'clareza:core:radar:all:last-good',
      { generationId: 'g1' },
      STABLE_TTL,
    )
  })

  it('returns the cached value on a hit and never calls compute', async () => {
    jest.spyOn(cacheService, 'get').mockResolvedValue({ generationId: 'cached' })
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async () => ({ generationId: 'fresh' }))

    const wrapped = withCoreCache('radar', 3600, () => 'all', compute)
    await expect(wrapped()).resolves.toEqual({ generationId: 'cached' })

    expect(compute).not.toHaveBeenCalled()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('propagates a compute failure when there is no last-good copy to fall back on', async () => {
    jest.spyOn(cacheService, 'get').mockResolvedValue(null)
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async () => { throw new RangeError('ticker nao encontrado') })

    const wrapped = withCoreCache('raiox', 3600, normalizeSymbolKey, compute)
    await expect(wrapped('AAPL')).rejects.toThrow('ticker nao encontrado')

    expect(setSpy).not.toHaveBeenCalled()
  })

  it('serves the last-good copy when compute rejects and one exists', async () => {
    jest.spyOn(cacheService, 'get').mockImplementation(async (key: string) => (
      key.endsWith(':last-good') ? { ticker: 'AAPL', stale: true } : null
    ))
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async () => { throw new Error('Mongo em baixo') })

    const wrapped = withCoreCache('raiox', 3600, normalizeSymbolKey, compute)
    await expect(wrapped('AAPL')).resolves.toEqual({ ticker: 'AAPL', stale: true })

    expect(setSpy).not.toHaveBeenCalled()
  })

  it('derives distinct keys per argument via keyOf', async () => {
    jest.spyOn(cacheService, 'get').mockResolvedValue(null)
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async (symbol: string) => ({ ticker: symbol }))

    const wrapped = withCoreCache('raiox', 3600, normalizeSymbolKey, compute)
    await wrapped('aapl')
    await wrapped('NVDA')

    expect(setSpy).toHaveBeenCalledWith('clareza:core:raiox:AAPL', { ticker: 'aapl' }, 3600)
    expect(setSpy).toHaveBeenCalledWith('clareza:core:raiox:NVDA', { ticker: 'NVDA' }, 3600)
  })

  describe('refresh', () => {
    it('recomputes and overwrites both keys without reading the cache first', async () => {
      const getSpy = jest.spyOn(cacheService, 'get').mockResolvedValue({ generationId: 'stale' })
      const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
      const compute = jest.fn(async () => ({ generationId: 'g2' }))

      const wrapped = withCoreCache('raiox', 3600, normalizeSymbolKey, compute)
      await expect(wrapped.refresh('MSFT')).resolves.toEqual({ generationId: 'g2' })

      expect(getSpy).not.toHaveBeenCalled()
      expect(compute).toHaveBeenCalledWith('MSFT')
      expect(setSpy).toHaveBeenCalledWith('clareza:core:raiox:MSFT', { generationId: 'g2' }, 3600)
      expect(setSpy).toHaveBeenCalledWith(
        'clareza:core:raiox:MSFT:last-good',
        { generationId: 'g2' },
        STABLE_TTL,
      )
    })
  })
})

describe('normalizeSymbolKey', () => {
  it('trims and uppercases', () => {
    expect(normalizeSymbolKey('  aapl  ')).toBe('AAPL')
  })
})

describe('normalizeQueryKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeQueryKey('  Apple Inc  ')).toBe('apple inc')
  })
})
