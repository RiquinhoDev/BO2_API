import type { Request, Response } from 'express'
import request from 'supertest'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

const mockProductFind = jest.fn()
const mockProductFindOne = jest.fn()
const mockGetUserCountForProduct = jest.fn()
const mockGetUsersByProduct = jest.fn()

jest.mock('../../src/models', () => ({
  Product: { find: mockProductFind, findOne: mockProductFindOne }
}))

jest.mock('../../src/services/userProducts/userProductService', () => ({
  getUserCountForProduct: mockGetUserCountForProduct,
  getUsersByProduct: mockGetUsersByProduct
}))

import {
  getHotmartProductBySubdomain,
  getHotmartProducts,
  getHotmartProductUsers,
  getHotmartStats
} from '../../src/controllers/hotmart/hotmartCatalog.controller'

type JsonResponse = {
  status: jest.Mock
  json: jest.Mock
}

function response(): JsonResponse {
  const json = jest.fn()
  const status = jest.fn().mockReturnValue({ json })
  return { status, json }
}

function objectId(value: string) {
  return { toString: () => value }
}

afterEach(() => jest.clearAllMocks())

test('lists Hotmart products with the exact V2 envelope and projection', async () => {
  const products = [{ _id: objectId('p1'), name: 'Clareza' }]
  const lean = jest.fn().mockResolvedValue(products)
  const select = jest.fn().mockReturnValue({ lean })
  mockProductFind.mockReturnValue({ select })
  const res = response()

  await getHotmartProducts({} as Request, res as unknown as Response, jest.fn())

  expect(mockProductFind).toHaveBeenCalledWith({ platform: 'hotmart' })
  expect(select).toHaveBeenCalledWith('name code platformData isActive')
  expect(res.json).toHaveBeenCalledWith({ success: true, data: products, meta: { count: 1, _v2Enabled: true } })
})

test('returns the product with its user count for the exact subdomain lookup', async () => {
  const product = { _id: objectId('p1'), name: 'Clareza', subdomain: 'clareza' }
  const exec = jest.fn().mockResolvedValue(product)
  const lean = jest.fn().mockReturnValue({ exec })
  mockProductFindOne.mockReturnValue({ lean })
  mockGetUserCountForProduct.mockResolvedValue(7)
  const res = response()

  await getHotmartProductBySubdomain(
    { params: { subdomain: 'clareza' } } as unknown as Request<{ subdomain: string }>,
    res as unknown as Response,
    jest.fn()
  )

  expect(mockProductFindOne).toHaveBeenCalledWith({ platform: 'hotmart', subdomain: 'clareza' })
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: { ...product, userCount: 7 },
    meta: { _v2Enabled: true }
  })
})

test('keeps the product-not-found response contract', async () => {
  const exec = jest.fn().mockResolvedValue(null)
  const lean = jest.fn().mockReturnValue({ exec })
  mockProductFindOne.mockReturnValue({ lean })
  const res = response()

  await getHotmartProductBySubdomain(
    { params: { subdomain: 'missing' } } as unknown as Request<{ subdomain: string }>,
    res as unknown as Response,
    jest.fn()
  )

  expect(res.status).toHaveBeenCalledWith(404)
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Produto Hotmart não encontrado para subdomain: missing'
  })
})

test('filters product users by status and minimum progress without changing the envelope', async () => {
  const productId = objectId('p1')
  mockProductFindOne.mockResolvedValue({ _id: productId })
  const matching = {
    products: [{
      product: { _id: productId },
      platformSpecificData: { hotmart: { status: 'active' } },
      progress: { progressPercentage: 75 }
    }]
  }
  const rejected = {
    products: [{
      product: { _id: productId },
      platformSpecificData: { hotmart: { status: 'inactive' } },
      progress: { progressPercentage: 20 }
    }]
  }
  mockGetUsersByProduct.mockResolvedValue([matching, rejected])
  const res = response()

  await getHotmartProductUsers(
    { params: { subdomain: 'clareza' }, query: { status: 'active', minProgress: '50' } } as unknown as Request<{ subdomain: string }>,
    res as unknown as Response,
    jest.fn()
  )

  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: [matching],
    meta: {
      count: 1,
      filters: { status: 'active', minProgress: '50' },
      _v2Enabled: true
    }
  })
})

test('summarizes users and active users while preserving top-level subdomain', async () => {
  const productId = objectId('p1')
  const products = [{ _id: productId, name: 'Clareza', subdomain: 'clareza' }]
  const lean = jest.fn().mockResolvedValue(products)
  mockProductFind.mockReturnValue({ lean })
  mockGetUsersByProduct.mockResolvedValue([
    { products: [{ product: { _id: productId }, platformSpecificData: { hotmart: { status: 'active' } } }] },
    { products: [{ product: { _id: productId }, platformSpecificData: { hotmart: { status: 'inactive' } } }] }
  ])
  const res = response()

  await getHotmartStats({} as Request, res as unknown as Response, jest.fn())

  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: [{ productId, productName: 'Clareza', subdomain: 'clareza', totalUsers: 2, activeUsers: 1 }],
    meta: {
      summary: { totalProducts: 1, totalUsers: 2, totalActiveUsers: 1 },
      _v2Enabled: true
    }
  })
})

test('forwards failures to the central redacted envelope', async () => {
  mockProductFind.mockImplementation(() => { throw new Error('query failed') })

  const response = await request(appForCentralError({
    kind: 'handler',
    handler: getHotmartProducts,
  })).get('/target?__bo2_offline_loopback=1')

  expectCentralError(response, {
    code: 'HOTMART_PRODUCT_LIST_FAILED',
    message: 'Erro ao buscar produtos Hotmart',
  })
})
