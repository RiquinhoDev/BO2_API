import { createClarezaJob } from '../../src/jobs/clareza.job'

const published = {
  status: 'published' as const,
  generationId: 'generation-a',
  collectedAssets: 879,
  missingAssets: 0,
  failedAssets: 0,
  reasonCodes: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('ClarezaDailyRefresh', () => {
  it('publishes the canonical core before starting companion refreshes', async () => {
    const calls: string[] = []
    const job = createClarezaJob({
      assertRefreshEnabled: () => calls.push('enabled'),
      refreshCore: async () => { calls.push('core'); return published },
      companions: [
        { name: 'Raio-X', refresh: async generationId => { calls.push(`raiox:${generationId}`); return { total: 1, errors: 0 } } },
        { name: 'Comparador', refresh: async () => { calls.push('comparador'); return { total: 2, errors: 0 } } },
        { name: 'Earnings', refresh: async () => { calls.push('earnings'); return { total: 3, errors: 0 } } },
      ],
      logger: { info: jest.fn(), error: jest.fn() },
    })

    await expect(job.run()).resolves.toEqual({ success: true, total: 879, errors: 0 })
    expect(calls[0]).toBe('enabled')
    expect(calls[1]).toBe('core')
    expect(calls.slice(2).sort()).toEqual(['comparador', 'earnings', 'raiox:generation-a'])
  })

  it('runs companion refreshes in parallel', async () => {
    const first = deferred<{ total: number; errors: number }>()
    const second = deferred<{ total: number; errors: number }>()
    const starts: string[] = []
    const job = createClarezaJob({
      assertRefreshEnabled: () => undefined,
      refreshCore: async () => published,
      companions: [
        { name: 'one', refresh: () => { starts.push('one'); return first.promise } },
        { name: 'two', refresh: () => { starts.push('two'); return second.promise } },
      ],
      logger: { info: jest.fn(), error: jest.fn() },
    })

    const run = job.run()
    await Promise.resolve()
    await Promise.resolve()
    expect(starts).toEqual(['one', 'two'])
    first.resolve({ total: 1, errors: 0 })
    second.resolve({ total: 1, errors: 0 })
    await expect(run).resolves.toEqual({ success: true, total: 879, errors: 0 })
  })

  it('does not start companions when the core generation is not published', async () => {
    const refreshCompanion = jest.fn()
    const job = createClarezaJob({
      assertRefreshEnabled: () => undefined,
      refreshCore: async () => ({ ...published, status: 'rejected', reasonCodes: ['scoring-coverage'] }),
      companions: [{ name: 'Earnings', refresh: refreshCompanion }],
      logger: { info: jest.fn(), error: jest.fn() },
    })

    await expect(job.run()).resolves.toEqual({ success: false, total: 879, errors: 1 })
    expect(refreshCompanion).not.toHaveBeenCalled()
  })

  it('runs Top10 only when supplied and contains companion failures', async () => {
    const error = jest.fn()
    const top10 = jest.fn(async () => ({ total: 10, errors: 0 }))
    const job = createClarezaJob({
      assertRefreshEnabled: () => undefined,
      refreshCore: async () => published,
      companions: [{ name: 'Earnings', refresh: async () => { throw new Error('provider secret') } }],
      top10: { name: 'Top10', refresh: top10 },
      logger: { info: jest.fn(), error },
    })

    await expect(job.run()).resolves.toEqual({ success: true, total: 879, errors: 1 })
    expect(top10).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(error.mock.calls)).not.toContain('provider secret')
  })

  it('calls no refresh when the Clareza kill switch is disabled', async () => {
    const refreshCore = jest.fn()
    const refreshCompanion = jest.fn()
    const job = createClarezaJob({
      assertRefreshEnabled: () => { throw new Error('disabled') },
      refreshCore,
      companions: [{ name: 'Earnings', refresh: refreshCompanion }],
      logger: { info: jest.fn(), error: jest.fn() },
    })

    await expect(job.run()).resolves.toEqual({ success: false, total: 0, errors: 1 })
    expect(refreshCore).not.toHaveBeenCalled()
    expect(refreshCompanion).not.toHaveBeenCalled()
  })
  it('prunes old generations before writing companions, so the space is free', async () => {
    const calls: string[] = []
    const job = createClarezaJob({
      assertRefreshEnabled: () => undefined,
      refreshCore: async () => published,
      companions: [
        { name: 'Raio-X', refresh: async () => { calls.push('raiox'); return { total: 1, errors: 0 } } },
      ],
      top10: { name: 'Top 10', refresh: async () => { calls.push('top10'); return { total: 1, errors: 0 } } },
      retention: async () => {
        calls.push('retention')
        return { retainedGenerations: 2, prunedCompanions: { 'Raio-X': 4 } }
      },
      logger: { info: jest.fn(), error: jest.fn() },
    })

    await expect(job.run()).resolves.toEqual({ success: true, total: 879, errors: 0 })
    expect(calls).toEqual(['retention', 'raiox', 'top10'])
  })

  it('keeps the refresh successful when the pruning fails', async () => {
    const logger = { info: jest.fn(), error: jest.fn() }
    const job = createClarezaJob({
      assertRefreshEnabled: () => undefined,
      refreshCore: async () => published,
      companions: [{ name: 'Raio-X', refresh: async () => ({ total: 1, errors: 0 }) }],
      retention: async () => { throw new Error('quota') },
      logger,
    })

    await expect(job.run()).resolves.toEqual({ success: true, total: 879, errors: 0 })
    expect(logger.error).toHaveBeenCalledWith('Clareza retention failed', { total: 0, errors: 1 })
  })

})
