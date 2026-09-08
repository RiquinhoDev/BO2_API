import { cacheService } from '../../../src/services/cache.service'
import {
  normalizeQueryKey,
  normalizeSymbolKey,
  withCoreCache,
} from '../../../src/services/clareza/core/coreReadCache'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('withCoreCache', () => {
  it('computes and stores on a miss, under the prefixed key', async () => {
    jest.spyOn(cacheService, 'get').mockResolvedValue(null)
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async () => ({ generationId: 'g1' }))

    const wrapped = withCoreCache('radar', 3600, () => 'all', compute)
    await expect(wrapped()).resolves.toEqual({ generationId: 'g1' })

    expect(compute).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledWith('clareza:core:radar:all', { generationId: 'g1' }, 3600)
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

  it('lets a compute failure propagate without caching it', async () => {
    jest.spyOn(cacheService, 'get').mockResolvedValue(null)
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async () => { throw new RangeError('ticker nao encontrado') })

    const wrapped = withCoreCache('raiox', 3600, normalizeSymbolKey, compute)
    await expect(wrapped('AAPL')).rejects.toThrow('ticker nao encontrado')

    expect(setSpy).not.toHaveBeenCalled()
  })

  it('derives distinct keys per argument via keyOf', async () => {
    jest.spyOn(cacheService, 'get').mockResolvedValue(null)
    const setSpy = jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
    const compute = jest.fn(async (symbol: string) => ({ ticker: symbol }))

    const wrapped = withCoreCache('raiox', 3600, normalizeSymbolKey, compute)
    await wrapped('aapl')
    await wrapped('NVDA')

    expect(setSpy).toHaveBeenNthCalledWith(1, 'clareza:core:raiox:AAPL', { ticker: 'aapl' }, 3600)
    expect(setSpy).toHaveBeenNthCalledWith(2, 'clareza:core:raiox:NVDA', { ticker: 'NVDA' }, 3600)
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
