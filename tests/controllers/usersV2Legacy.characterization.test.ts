import express from 'express'
import request from 'supertest'

const mockUserFind = jest.fn()
const mockUserCountDocuments = jest.fn()
const mockUserProductAggregate = jest.fn()
const mockUserProductFind = jest.fn()
const mockProductFind = jest.fn()
const mockGetUsersForProduct = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    countDocuments: mockUserCountDocuments,
    find: mockUserFind,
  },
}))

jest.mock('../../src/models', () => ({
  UserProduct: {
    aggregate: mockUserProductAggregate,
    find: mockUserProductFind,
  },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {
    find: mockProductFind,
  },
}))

jest.mock('../../src/services/userProducts/userProductService', () => ({
  getUserCountsByPlatform: jest.fn(),
  getUserCountsByProduct: jest.fn(),
  getUsersForProduct: mockGetUsersForProduct,
  getUserWithProducts: jest.fn(),
}))

import { getUsers } from '../../src/controllers/users.controller'

function queryResult<T>(rows: T[]) {
  const lean = jest.fn(async () => rows)
  const limit = jest.fn(() => ({ lean }))
  const skip = jest.fn(() => ({ limit }))
  const select = jest.fn(() => ({ lean, skip }))
  return { lean, select }
}

function createApp() {
  const app = express()
  app.get('/users', getUsers)
  return app
}

const user = {
  _id: 'user-1',
  name: 'Alice',
  email: 'alice@example.test',
  combined: { status: 'ACTIVE' },
}

const enrollment = {
  _id: 'enrollment-1',
  userId: 'user-1',
  productId: 'product-1',
  platform: 'hotmart',
  status: 'ACTIVE',
  enrolledAt: new Date('2026-07-30T12:00:00.000Z'),
  isPrimary: true,
  progress: { percentage: 50 },
  engagement: { engagementScore: 77 },
}

const product = {
  _id: 'product-1',
  name: 'Course One',
  code: 'course-one',
  platform: 'hotmart',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUserFind.mockImplementation(() => queryResult([user]))
  mockUserCountDocuments.mockResolvedValue(1)
  mockUserProductFind.mockImplementation(() => queryResult([enrollment]))
  mockProductFind.mockImplementation(() => queryResult([product]))
  mockUserProductAggregate.mockResolvedValue([
    { total: [{ count: 1 }], data: [{ _id: 'user-1' }] },
  ])
})

describe('legacy users V2 list handler', () => {
  it('keeps flattened rows, old pagination and empty products compatibility without a product filter', async () => {
    const response = await request(createApp())
      .get('/users?limit=10000&benign=x&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: [{
        _id: 'enrollment-1',
        averageEngagement: 77,
        averageEngagementLevel: 'ALTO',
        products: [],
      }],
      pagination: {
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 100,
      },
    })
    expect(response.body.filters).not.toHaveProperty('benign')
  })

  it('applies score 77 whenever topPercentage is present', async () => {
    const response = await request(createApp())
      .get('/users?topPercentage=0&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(mockUserProductAggregate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        $match: {
          'engagement.engagementScore': { $gte: 77 },
        },
      }),
    ]))
  })

  it('returns grouped product users with compatibility products and ignores other filters', async () => {
    mockGetUsersForProduct.mockResolvedValue([{ _id: 'grouped-user' }])
    const productId = 'a'.repeat(24)

    const response = await request(createApp())
      .get(`/users?productId=${productId}&limit=1&status=CANCELLED&__bo2_offline_loopback=1`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: [{ _id: 'grouped-user', products: [] }],
      pagination: { total: 1 },
      filters: { productId },
    })
  })
})
