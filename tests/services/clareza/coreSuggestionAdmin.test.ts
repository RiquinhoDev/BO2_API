import {
  CoreSuggestionAdminAuthorizationError,
  createCoreSuggestionAdminService,
  planLegacySuggestionImport,
} from '../../../src/services/clareza/core/coreSuggestionAdmin'

describe('core suggestion administration', () => {
  const items = [
    { key: 'AAPL', query: '=HYPERLINK("bad")', count: 9, firstRequestedAt: '2026-08-01T00:00:00.000Z', lastRequestedAt: '2026-09-01T00:00:00.000Z', status: 'pending' as const },
    { key: 'VWCE.DE', query: 'VWCE.DE', count: 3, firstRequestedAt: '2026-08-02T00:00:00.000Z', lastRequestedAt: '2026-08-30T00:00:00.000Z', status: 'covered' as const },
  ]

  it('authorizes before reading and applies bounded demand ordering pagination', async () => {
    const authorize = jest.fn().mockResolvedValue(undefined)
    const list = jest.fn().mockResolvedValue({ total: 202, items })
    const service = createCoreSuggestionAdminService({ authorize, store: { list } })

    const result = await service.list(2, 25)
    expect(authorize).toHaveBeenCalledWith('read')
    expect(list).toHaveBeenCalledWith({ offset: 25, limit: 25, order: 'demand-desc' })
    expect(result).toEqual({ page: 2, pageSize: 25, total: 202, items })
  })

  it('blocks unauthorized reads before touching the store', async () => {
    const list = jest.fn()
    const service = createCoreSuggestionAdminService({
      authorize: jest.fn().mockRejectedValue(new CoreSuggestionAdminAuthorizationError()),
      store: { list },
    })
    await expect(service.list(1, 20)).rejects.toBeInstanceOf(CoreSuggestionAdminAuthorizationError)
    expect(list).not.toHaveBeenCalled()
  })

  it('exports bounded CSV and neutralizes spreadsheet formula injection', async () => {
    const list = jest.fn().mockResolvedValue({ total: 2, items })
    const service = createCoreSuggestionAdminService({ authorize: jest.fn(), store: { list } })

    const csv = await service.exportCsv(100)
    expect(list).toHaveBeenCalledWith({ offset: 0, limit: 100, order: 'demand-desc' })
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"')
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('plans an authorized dry-run import idempotently without writes', () => {
    expect(planLegacySuggestionImport([
      { query: ' vwce.de ', count: 2 }, { query: 'VWCE.DE', count: 4 }, { query: 'Novo', count: 1 },
    ], ['VWCE.DE'], { sourceAuthorized: true, dryRun: true })).toEqual({
      dryRun: true, skipped: ['VWCE.DE'], planned: [{ key: 'NOVO', query: 'Novo', count: 1 }],
    })
    expect(() => planLegacySuggestionImport([], [], { sourceAuthorized: false, dryRun: true }))
      .toThrow(CoreSuggestionAdminAuthorizationError)
  })
})
