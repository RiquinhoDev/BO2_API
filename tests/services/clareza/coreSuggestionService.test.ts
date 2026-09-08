import {
  CoreSuggestionValidationError,
  createCoreSuggestionService,
  type CoreSuggestionRecord,
  type CoreSuggestionStore,
} from '../../../src/services/clareza/core/coreSuggestionService'

class AtomicMemorySuggestionStore implements CoreSuggestionStore {
  private readonly records = new Map<string, CoreSuggestionRecord>()
  private readonly submissions = new Set<string>()

  async increment(input: { key: string; query: string; requestedAt: string; submissionId: string }) {
    if (this.submissions.has(input.submissionId)) {
      return { record: this.records.get(input.key)!, replayed: true }
    }
    this.submissions.add(input.submissionId)
    const previous = this.records.get(input.key)
    const record: CoreSuggestionRecord = previous
      ? { ...previous, count: previous.count + 1, lastRequestedAt: input.requestedAt }
      : { key: input.key, query: input.query, count: 1, firstRequestedAt: input.requestedAt, lastRequestedAt: input.requestedAt, status: 'pending' }
    this.records.set(input.key, record)
    return { record, replayed: false }
  }
}

describe('core suggestion service', () => {
  it('normalizes Unicode/whitespace and increments atomically under concurrent submissions', async () => {
    const store = new AtomicMemorySuggestionStore()
    const service = createCoreSuggestionService({ store, knownTickers: [], now: () => '2026-09-01T13:00:00.000Z' })
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (
      service.submit('  vwce．de  ', `submission_${String(index).padStart(6, '0')}`)
    )))

    expect(results.at(-1)?.record).toMatchObject({ key: 'VWCE.DE', query: 'vwce.de', count: 20 })
  })

  it('does not write when the normalized ticker is already known', async () => {
    const store = { increment: jest.fn() }
    const service = createCoreSuggestionService({ store, knownTickers: ['ASML.AS'], now: () => '2026-09-01T13:00:00.000Z' })

    await expect(service.submit(' asml.as ', 'submission_000001')).resolves.toEqual({ outcome: 'known', ticker: 'ASML.AS' })
    expect(store.increment).not.toHaveBeenCalled()
  })

  it('does not write when a persisted alias already resolves the requested ticker', async () => {
    const store = { increment: jest.fn() }
    const resolveAlias = jest.fn().mockResolvedValue('CSP1.L')
    const service = createCoreSuggestionService({
      store, knownTickers: [], resolveAlias,
      now: () => '2026-09-01T13:00:00.000Z',
    })

    await expect(service.submit(' cspx.as ', 'submission_000001')).resolves.toEqual({
      outcome: 'known', ticker: 'CSP1.L', viaAlias: 'CSPX.AS',
    })
    expect(resolveAlias).toHaveBeenCalledWith('CSPX.AS')
    expect(store.increment).not.toHaveBeenCalled()
  })

  it('returns replay without increasing count and rejects invalid input', async () => {
    const store = new AtomicMemorySuggestionStore()
    const service = createCoreSuggestionService({ store, knownTickers: [], now: () => '2026-09-01T13:00:00.000Z' })

    const first = await service.submit('Novo ativo', 'submission_000001')
    const replay = await service.submit('Novo ativo', 'submission_000001')
    if (first.outcome === 'known') throw new Error('test suggestion unexpectedly matched the universe')
    expect(first.record.count).toBe(1)
    expect(replay).toMatchObject({ outcome: 'replayed', record: { count: 1 } })
    await expect(service.submit('   ', 'submission_000002')).rejects.toBeInstanceOf(CoreSuggestionValidationError)
    await expect(service.submit('x'.repeat(81), 'submission_000003')).rejects.toBeInstanceOf(CoreSuggestionValidationError)
    await expect(service.submit('A\0B', 'submission_000004')).rejects.toBeInstanceOf(CoreSuggestionValidationError)
    await expect(service.submit('AAPL', 'short')).rejects.toBeInstanceOf(CoreSuggestionValidationError)
  })

  it('propagates store failure instead of returning success', async () => {
    const service = createCoreSuggestionService({
      store: { increment: jest.fn().mockRejectedValue(new Error('write failed')) },
      knownTickers: [], now: () => '2026-09-01T13:00:00.000Z',
    })
    await expect(service.submit('AAPL', 'submission_000001')).rejects.toThrow('write failed')
  })
})
