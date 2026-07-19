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

import { Product } from '../../src/models'
import { getUsersByProduct } from '../../src/services/userProducts/userProductService'
import { getHotmartStats } from '../../src/controllers/syncUtilizadoresControllers/hotmart.controller'

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
