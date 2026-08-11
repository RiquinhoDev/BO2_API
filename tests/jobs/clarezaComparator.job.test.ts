import { createClarezaJob } from '../../src/jobs/clareza.job'

function refresh(total: number, errors = 0): () => Promise<{ readonly total: number; readonly errors: number }> {
  return async () => ({ total, errors })
}

describe('Clareza comparator scheduled refresh', () => {
  it('runs the full comparator refresh after the existing products without altering the primary job result', async () => {
    const calls: string[] = []
    const job = createClarezaJob({
      refreshClarezaData: async () => { calls.push('market'); return { total: 3, errors: 0 } },
      refreshClarezaTop10Data: async () => { calls.push('top10'); return { total: 2, errors: 0 } },
      refreshClarezaRaioxData: async () => { calls.push('raiox'); return { total: 1, errors: 0 } },
      refreshClarezaCarteiraData: async () => { calls.push('carteira'); return { total: 4, errors: 0 } },
      refreshClarezaEarningsData: async () => { calls.push('earnings'); return { total: 5, errors: 0 } },
      refreshClarezaComparadorData: async () => { calls.push('comparador'); return { total: 6, errors: 1 } },
      logger: { info: jest.fn(), error: jest.fn() },
    })

    await expect(job.run()).resolves.toEqual({ success: true, total: 3, errors: 0 })
    expect(calls).toEqual(['market', 'top10', 'raiox', 'carteira', 'earnings', 'comparador'])
  })

  it('contains comparator failure as best effort and records only safe aggregate metadata', async () => {
    const logError = jest.fn()
    const job = createClarezaJob({
      refreshClarezaData: refresh(3),
      refreshClarezaTop10Data: refresh(2),
      refreshClarezaRaioxData: refresh(1),
      refreshClarezaCarteiraData: refresh(4),
      refreshClarezaEarningsData: refresh(5),
      refreshClarezaComparadorData: async () => { throw new Error('secret token') },
      logger: { info: jest.fn(), error: logError },
    })

    await expect(job.run()).resolves.toEqual({ success: true, total: 3, errors: 0 })
    expect(logError).toHaveBeenCalledWith('Clareza comparador refresh failed', { total: 0, errors: 1 })
    expect(JSON.stringify(logError.mock.calls)).not.toContain('secret token')
  })
})
