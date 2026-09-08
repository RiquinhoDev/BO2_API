import type { Router } from 'express'

jest.mock('../../src/models/ACRenewalData', () => ({ __esModule: true, default: { find: jest.fn(), countDocuments: jest.fn() } }))
jest.mock('../../src/models/HotmartSaleHistory', () => ({ __esModule: true, default: { find: jest.fn(), countDocuments: jest.fn() } }))
jest.mock('../../src/services/renewal/acRenewalDataSync.service', () => ({ syncActiveStudentAcRenewalData: jest.fn() }))
jest.mock('../../src/services/renewal/hotmartSalesHistory.service', () => ({ syncActiveStudentSalesHistory: jest.fn() }))
import ACRenewalData from '../../src/models/ACRenewalData'
import HotmartSaleHistory from '../../src/models/HotmartSaleHistory'
import acRouter from '../../src/routes/acRenewalData.routes'
import hotmartRouter from '../../src/routes/hotmartSalesHistory.routes'

function read(router: Router, endpoint: string, query: Record<string, unknown>): Promise<any> {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === endpoint && entry.route.methods.get)
  return new Promise((resolve, reject) => {
    layer.route.stack[0].handle({ query }, { json: resolve }, reject)
  })
}

describe.each([
  ['AC', acRouter, '/', ACRenewalData, 'entries'],
  ['Hotmart', hotmartRouter, '/history', HotmartSaleHistory, 'history'],
] as const)('%s bounded read pagination', (_name, router, endpoint, model, listKey) => {
  let chain: Record<string, jest.Mock>
  beforeEach(() => {
    jest.clearAllMocks()
    chain = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), lean: jest.fn(), exec: jest.fn().mockResolvedValue([{ _id: 'page-row' }]) }
    for (const key of ['sort', 'skip', 'limit', 'lean']) chain[key].mockReturnValue(chain)
    ;(model.find as jest.Mock).mockReturnValue(chain)
    ;(model.countDocuments as jest.Mock).mockResolvedValue(451)
  })

  test('returns total and next-page metadata instead of implying one page is complete', async () => {
    const body = await read(router, endpoint, { limit: '200', offset: '200' })
    expect(chain.skip).toHaveBeenCalledWith(200)
    expect(chain.limit).toHaveBeenCalledWith(200)
    expect(body).toEqual({ success: true, data: { [listKey]: [{ _id: 'page-row' }], total: 451, pagination: { limit: 200, offset: 200, total: 451, hasMore: true } } })
  })
  test('keeps a maximum of 200 rows and marks the last page', async () => {
    const body = await read(router, endpoint, { limit: '9999', offset: '450' })
    expect(chain.limit).toHaveBeenCalledWith(200)
    expect(body.data.pagination.hasMore).toBe(false)
  })
  test.each(['-1', '1.5', 'NaN', '100001', ['0', '200']])('rejects invalid offset %p before reading', async (offset) => {
    await expect(read(router, endpoint, { offset })).rejects.toMatchObject({ code: 'INVALID_PAGE_OFFSET', status: 400 })
    expect(model.find).not.toHaveBeenCalled()
  })
  test('propagates a count failure rather than returning incomplete success', async () => {
    ;(model.countDocuments as jest.Mock).mockRejectedValue(new Error('count failed'))
    await expect(read(router, endpoint, {})).rejects.toThrow('count failed')
  })
})
