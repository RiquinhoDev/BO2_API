import {
  CoreAnalystConsensusCoordinator,
  type CoreAnalystConsensusDataset,
} from '../../../src/services/clareza/core/coreAnalystConsensus'

describe('core analyst consensus', () => {
  const stale: CoreAnalystConsensusDataset = {
    ticker: 'AAPL', gradesConsensus: { consensus: 'buy' },
    priceTargetConsensus: { targetConsensus: 220 },
    updatedAt: '2026-08-31T10:00:00.000Z',
  }

  it('reuses one fresh dataset for Comparador and Raio-X without collection', async () => {
    const read = jest.fn().mockResolvedValue({ ...stale, updatedAt: '2026-09-01T11:30:00.000Z' })
    const write = jest.fn()
    const collect = jest.fn()
    const coordinator = new CoreAnalystConsensusCoordinator({ read, write }, { collect })

    const comparador = await coordinator.get('AAPL', 'comparador', new Date('2026-09-01T12:00:00.000Z'), 3_600_000)
    const raiox = await coordinator.get('AAPL', 'raiox', new Date('2026-09-01T12:00:00.000Z'), 3_600_000)

    expect(comparador).toEqual(expect.objectContaining({ outcome: 'fresh', dataset: expect.objectContaining({ ticker: 'AAPL' }) }))
    expect(raiox.dataset).toEqual(comparador.dataset)
    expect(collect).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent stale collection across consumers and persists one shared dataset', async () => {
    let release: ((value: { gradesConsensus: { consensus: string }; priceTargetConsensus: { targetConsensus: number } }) => void) | undefined
    const read = jest.fn().mockResolvedValue(stale)
    const write = jest.fn().mockResolvedValue(undefined)
    const collect = jest.fn(() => new Promise<{
      gradesConsensus: { consensus: string }
      priceTargetConsensus: { targetConsensus: number }
    }>(resolve => { release = resolve }))
    const coordinator = new CoreAnalystConsensusCoordinator({ read, write }, { collect })

    const first = coordinator.get('aapl', 'comparador', new Date('2026-09-01T12:00:00.000Z'), 60_000)
    const second = coordinator.get(' AAPL ', 'raiox', new Date('2026-09-01T12:00:00.000Z'), 60_000)
    await Promise.resolve()
    expect(collect).toHaveBeenCalledTimes(1)
    release?.({ gradesConsensus: { consensus: 'strong buy' }, priceTargetConsensus: { targetConsensus: 250 } })

    const [left, right] = await Promise.all([first, second])
    expect(left).toEqual(right)
    expect(left).toMatchObject({ outcome: 'refreshed', dataset: { ticker: 'AAPL', updatedAt: '2026-09-01T12:00:00.000Z' } })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it.each(['empty', 'error'] as const)('preserves the previous dataset on %s collection with diagnostics', async mode => {
    const read = jest.fn().mockResolvedValue(stale)
    const write = jest.fn()
    const collect = mode === 'empty'
      ? jest.fn().mockResolvedValue({ gradesConsensus: null, priceTargetConsensus: null })
      : jest.fn().mockRejectedValue(new Error('provider unavailable'))
    const coordinator = new CoreAnalystConsensusCoordinator({ read, write }, { collect })

    const result = await coordinator.get('AAPL', 'comparador', new Date('2026-09-01T12:00:00.000Z'), 60_000)

    expect(result).toEqual({ outcome: 'preserved', dataset: stale, diagnostic: `collection-${mode}` })
    expect(write).not.toHaveBeenCalled()
  })
})
