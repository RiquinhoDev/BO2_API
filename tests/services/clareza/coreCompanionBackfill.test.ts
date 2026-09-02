import { createCoreCompanionBackfill } from '../../../src/services/clareza/core/coreCompanionBackfill'
import { CoreGenerationUnavailableError } from '../../../src/services/clareza/core/coreRadarProjection'

describe('canonical companion backfill', () => {
  it('fills every companion for the exact published generation', async () => {
    const raiox = jest.fn().mockResolvedValue({ total: 185, errors: 0 })
    const earnings = jest.fn().mockResolvedValue({ total: 347, errors: 2 })
    const top10 = jest.fn().mockResolvedValue({ total: 10, errors: 0 })
    const run = createCoreCompanionBackfill({
      readPublished: jest.fn().mockResolvedValue({ generationId: 'core-1' }),
      raiox, earnings, top10,
    })

    await expect(run()).resolves.toEqual({
      generationId: 'core-1', errors: 2,
      raiox: { total: 185, errors: 0 },
      earnings: { total: 347, errors: 2 },
      top10: { total: 10, errors: 0 },
    })
    expect(raiox).toHaveBeenCalledWith('core-1')
    expect(earnings).toHaveBeenCalledWith('core-1')
    expect(top10).toHaveBeenCalledWith('core-1')
  })

  it('fails before provider work when no generation is published', async () => {
    const refresh = jest.fn()
    const run = createCoreCompanionBackfill({
      readPublished: jest.fn().mockResolvedValue(null),
      raiox: refresh, earnings: refresh, top10: refresh,
    })

    await expect(run()).rejects.toBeInstanceOf(CoreGenerationUnavailableError)
    expect(refresh).not.toHaveBeenCalled()
  })
})
