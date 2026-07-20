import type { Request, Response } from 'express'

jest.mock('../../src/models', () => ({
  Class: {},
  Product: { find: jest.fn() },
  SyncHistory: {},
  User: {}
}))

jest.mock('../../src/services/userProducts/userProductService', () => ({
  getUserCountForProduct: jest.fn(),
  getUsersByProduct: jest.fn()
}))

jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: { fetchHotmartDataForSync: jest.fn() }
}))

jest.mock('../../src/services/syncUtilizadoresServices/universalSyncService', () => ({
  __esModule: true,
  default: { executeUniversalSync: jest.fn() }
}))

import { Product } from '../../src/models'
import { getUsersByProduct } from '../../src/services/userProducts/userProductService'
import hotmartAdapter from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import universalSyncService from '../../src/services/syncUtilizadoresServices/universalSyncService'
import {
  getHotmartStats,
  syncHotmartUsersUniversal
} from '../../src/controllers/syncUtilizadoresControllers/hotmart.controller'

test('returns the canonical top-level Hotmart subdomain in stats', async () => {
  const products = [{
    _id: { toString: () => 'product-id' },
    name: 'Clareza',
    subdomain: 'clareza'
  }]
  const lean = jest.fn().mockResolvedValue(products)
  jest.mocked(Product.find).mockReturnValue(
    { lean } as unknown as ReturnType<typeof Product.find>
  )
  jest.mocked(getUsersByProduct).mockResolvedValue([])

  const json = jest.fn()
  await getHotmartStats({} as Request, { json } as unknown as Response)

  expect(json).toHaveBeenCalledWith(expect.objectContaining({
    data: [expect.objectContaining({ subdomain: 'clareza' })]
  }))
})

test('forwards the authenticated principal id to universal sync', async () => {
  jest.mocked(hotmartAdapter.fetchHotmartDataForSync).mockResolvedValue([{
    email: 'student@example.test',
    name: 'Student',
    hotmartUserId: 'hotmart-id'
  }])
  jest.mocked(universalSyncService.executeUniversalSync).mockResolvedValue({
    success: true,
    reportId: 'report-id',
    syncHistoryId: 'history-id',
    stats: { total: 1, inserted: 1, updated: 0, errors: 0, skipped: 0, unchanged: 0 },
    duration: 1,
    errors: [],
    warnings: []
  })

  const status = jest.fn().mockReturnThis()
  const json = jest.fn()
  const req = { user: { id: 'admin-id' } } as Request

  await syncHotmartUsersUniversal(req, { status, json } as unknown as Response)

  expect(universalSyncService.executeUniversalSync).toHaveBeenCalledWith(
    expect.objectContaining({ triggeredByUser: 'admin-id' })
  )
})
