import { createCoreRaioxCompanionRefresh } from '../../../src/services/clareza/core/coreRaioxCompanionRefresh'

const collected = {
  generationId: 'generation-a', createdAt: new Date('2026-09-02T03:30:00.000Z'),
  sectorPe: [], companions: { AAPL: {} as never }, errors: [{ ticker: 'MSFT', code: 'FMP_DOWN' }],
}

describe('core Raio-X companion refresh', () => {
  it('persists companions under the exact published generation id', async () => {
    const replace = jest.fn(async () => undefined)
    const collect = jest.fn(async () => collected)
    const refresh = createCoreRaioxCompanionRefresh({
      collector: { collect }, store: { read: async () => null, replace },
    })

    await expect(refresh('generation-a')).resolves.toEqual({ total: 1, errors: 1 })
    expect(collect).toHaveBeenCalledWith('generation-a')
    expect(replace).toHaveBeenCalledWith(collected)
  })

  it('is idempotent and makes zero FMP collection calls when that generation already exists', async () => {
    const collect = jest.fn()
    const refresh = createCoreRaioxCompanionRefresh({
      collector: { collect },
      store: { read: async () => ({ generationId: 'generation-a', sectorPe: [], companions: { AAPL: {} as never } }), replace: jest.fn() },
    })

    await expect(refresh('generation-a')).resolves.toEqual({ total: 1, errors: 0 })
    expect(collect).not.toHaveBeenCalled()
  })
})
