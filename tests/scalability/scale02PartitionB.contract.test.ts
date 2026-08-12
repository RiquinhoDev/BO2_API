const productFind = jest.fn()
const userProductFind = jest.fn()
const userFind = jest.fn()
const statsUpdate = jest.fn()
const classFind = jest.fn()
const classUserFind = jest.fn()

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
jest.mock('../../src/models/Class', () => ({ Class: { find: classFind }, ClassHistory: {}, InactivationList: {} }))
jest.mock('../../src/models', () => ({ User: { find: classUserFind } }))

jest.mock('../../src/services/productSales/dateResolver', () => ({
  determineSaleDate: jest.fn(async () => ({
    date: new Date('2026-01-02T00:00:00.000Z'),
    source: 'enrolledAt',
  })),
}))

import { buildProductSalesStats } from '../../src/services/productSalesStatsBuilder'
import { MongooseClassDetailsReader } from '../../src/services/classes/mongooseClassDetails.reader'

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

    const historical = enrollments.map((enrollment, index) => ({
      ...enrollment,
      _id: { toString: () => 'older-' + index },
      userId: { toString: () => 'user-' + (index % uniqueUsers) },
    })).reverse()
    productFind.mockResolvedValue(products)
    userProductFind
      .mockReturnValueOnce(chain(enrollments))
      .mockReturnValueOnce(chain(historical))
    userFind.mockReturnValue(chain(users))
    statsUpdate.mockResolvedValue({})

    await buildProductSalesStats()

    expect(userProductFind).toHaveBeenCalledTimes(2)
    expect(userProductFind.mock.results[1].value.sort).toHaveBeenCalledWith({ enrolledAt: 1, _id: 1 })
    const setLookup = userProductFind.mock.calls[1][0]
    expect(setLookup.userId.$in).toHaveLength(uniqueUsers)
    expect(new Set(setLookup.userId.$in.map((id: { toString(): string }) => id.toString())).size).toBe(uniqueUsers)
    const persisted = statsUpdate.mock.calls[0][1].$set
    expect(persisted.meta.totalRecordsProcessed).toBe(n)
    expect(persisted.totals.allTime).toBe(n)
    expect(persisted.salesByMonth[0].newStudents).toBe(0)
    expect(persisted.salesByMonth[0].existingStudents).toBe(n)
  })

  afterEach(() => jest.clearAllMocks())
})

describe.each([1, 10, 100])('class details bounded enrichment N=%i', n => {
  it('preserves order/cardinality and never exceeds ten concurrent enrichments', async () => {
    const classes = Array.from({ length: n }, (_, index) => ({ classId: `class-${index}` }))
    let active = 0
    let peak = 0
    classFind.mockReturnValue({ lean: jest.fn().mockResolvedValue(classes) })
    classUserFind.mockImplementation(({ classId }: { classId: string }) => ({ lean: jest.fn(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setImmediate(resolve))
      active -= 1
      return [{ classId }]
    }) }))
    const rows = await new MongooseClassDetailsReader().fetchAll({ includeStudents: true })
    expect(peak).toBeLessThanOrEqual(10)
    expect(rows).toHaveLength(n)
    expect(rows.map(row => row.classId)).toEqual(classes.map(row => row.classId))
  })
  afterEach(() => jest.clearAllMocks())
})