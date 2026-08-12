const productFind = jest.fn()
const userProductFind = jest.fn()
const userFind = jest.fn()
const statsUpdate = jest.fn()

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { find: productFind },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: userProductFind },
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: userFind },
}))
jest.mock('../../src/models/product/ProductSalesStats', () => ({
  __esModule: true,
  default: { findOneAndUpdate: statsUpdate },
}))
jest.mock('../../src/services/productSales/dateResolver', () => ({
  determineSaleDate: jest.fn(async () => ({
    date: new Date('2026-01-02T00:00:00.000Z'),
    source: 'enrolledAt',
  })),
}))

import { buildProductSalesStats } from '../../src/services/productSalesStatsBuilder'

const chain = <T>(value: T) => ({
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(value),
})

describe.each([1, 10, 100])('product sales set lookup N=%i', n => {
  it('accounts for every enrollment once with fixed query count and deduplicated user keys', async () => {
    const productId = { toString: () => 'product-1' }
    const products = [{ _id: productId, code: 'P1', name: 'Product', platform: 'hotmart' }]
    const enrollments = Array.from({ length: n }, (_, index) => ({
      _id: { toString: () => `enrollment-${index}` },
      userId: { toString: () => `user-${index % Math.max(1, Math.ceil(n / 2))}` },
      platform: 'hotmart',
      enrolledAt: new Date('2026-01-02T00:00:00.000Z'),
    }))
    const uniqueUsers = Math.max(1, Math.ceil(n / 2))
    const users = Array.from({ length: uniqueUsers }, (_, index) => ({
      _id: { toString: () => `user-${index}` },
    }))

    productFind.mockResolvedValue(products)
    userProductFind
      .mockReturnValueOnce(chain(enrollments))
      .mockReturnValueOnce(chain(enrollments))
    userFind.mockReturnValue(chain(users))
    statsUpdate.mockResolvedValue({})

    await buildProductSalesStats()

    expect(userProductFind).toHaveBeenCalledTimes(2)
    const setLookup = userProductFind.mock.calls[1][0]
    expect(setLookup.userId.$in).toHaveLength(uniqueUsers)
    expect(new Set(setLookup.userId.$in.map((id: { toString(): string }) => id.toString())).size).toBe(uniqueUsers)
    const persisted = statsUpdate.mock.calls[0][1].$set
    expect(persisted.meta.totalRecordsProcessed).toBe(n)
    expect(persisted.totals.allTime).toBe(n)
    expect(persisted.salesByMonth[0].newStudents).toBe(uniqueUsers)
    expect(persisted.salesByMonth[0].existingStudents).toBe(n - uniqueUsers)
  })

  afterEach(() => jest.clearAllMocks())
})
