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
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { buildProductSalesStats } from '../../src/services/productSalesStatsBuilder'

const query = <T>(value: T) => ({
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(value),
})

const fixture = (size: number) => {
  const products = Array.from({ length: size }, (_, index) => ({
    _id: `product-${index}`,
    code: `P-${index}`,
    name: `Product ${index}`,
    platform: 'hotmart',
    isActive: true,
  }))
  const enrollments = products.map((product, index) => ({
    _id: `enrollment-${index}`,
    productId: product._id,
    userId: `user-${index}`,
    platform: 'hotmart',
    enrolledAt: new Date('2026-01-02T00:00:00.000Z'),
  }))
  const users = enrollments.map(enrollment => ({
    _id: enrollment.userId,
    metadata: { firstSystemEntry: new Date('2026-01-01T00:00:00.000Z') },
  }))
  return { products, enrollments, users }
}

const arrangeBuilder = (size: number, options: { productReadError?: string } = {}) => {
  const data = fixture(size)
  productFind.mockResolvedValue(data.products)
  userProductFind.mockImplementation((filter: { productId?: string; userId?: { $in: string[] } }) => {
    if (filter.productId) {
      if (filter.productId === options.productReadError) {
        return {
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockRejectedValue(new Error(`read-${filter.productId}`)),
        }
      }
      return query(data.enrollments.filter(enrollment => enrollment.productId === filter.productId))
    }
    const ids = new Set(filter.userId?.$in ?? [])
    return query(data.enrollments.filter(enrollment => ids.has(enrollment.userId)))
  })
  userFind.mockImplementation((filter: { _id: { $in: string[] } }) => {
    const ids = new Set(filter._id.$in)
    return query(data.users.filter(user => ids.has(user._id)))
  })
  return data
}

describe.each([1, 10, 100])('product sales outer traversal N=%i', size => {
  afterEach(() => jest.clearAllMocks())

  test('keeps product order, one stats write in flight and one upsert per product', async () => {
    const { products } = arrangeBuilder(size)
    let active = 0
    let peak = 0
    const order: string[] = []
    statsUpdate.mockImplementation(async (filter: { productId: string }) => {
      active++
      peak = Math.max(peak, active)
      order.push(filter.productId)
      await Promise.resolve()
      active--
      return {}
    })

    const result = await buildProductSalesStats()

    expect(peak).toBe(1)
    expect(order).toEqual(products.map(product => product._id))
    expect(statsUpdate).toHaveBeenCalledTimes(size)
    expect(result).toMatchObject({
      productsFound: size,
      productsProcessed: size,
      productsSucceeded: size,
      errors: [],
    })
  })
})

test('converges an active product with no UserProducts to empty stats', async () => {
  jest.clearAllMocks()
  const { products } = arrangeBuilder(1)
  userProductFind.mockReturnValue(query([]))
  statsUpdate.mockResolvedValue({})

  const result = await buildProductSalesStats()

  expect(userProductFind).toHaveBeenCalledTimes(1)
  expect(userFind).not.toHaveBeenCalled()
  expect(statsUpdate).toHaveBeenCalledTimes(1)
  expect(statsUpdate.mock.calls[0][1].$set).toMatchObject({
    salesByMonth: [],
    salesByYear: [],
    totals: { allTime: 0, lastYear: 0, last6Months: 0, last3Months: 0, lastMonth: 0, currentMonth: 0 },
    meta: { totalRecordsProcessed: 0, recordsWithValidDates: 0, recordsWithoutDates: 0 },
  })
  expect(result).toMatchObject({ productsSucceeded: 1, productsWithNoUserProducts: 1, errors: [] })
  expect(statsUpdate.mock.calls[0][0].productId).toBe(products[0]._id)
})

test('isolates a product read failure and continues with later products', async () => {
  jest.clearAllMocks()
  const { products } = arrangeBuilder(10, { productReadError: 'product-2' })
  statsUpdate.mockResolvedValue({})

  const result = await buildProductSalesStats()

  expect(result.productsProcessed).toBe(10)
  expect(result.productsSucceeded).toBe(9)
  expect(result.errors).toEqual([{ productId: 'product-2', error: 'read-product-2' }])
  expect(statsUpdate).toHaveBeenCalledTimes(9)
  expect(statsUpdate.mock.calls.map(([filter]) => filter.productId)).toEqual(
    products.filter(product => product._id !== 'product-2').map(product => product._id)
  )
})

test('isolates a product upsert failure and allows the next rebuild to retry it', async () => {
  jest.clearAllMocks()
  arrangeBuilder(10)
  statsUpdate.mockImplementation(async (filter: { productId: string }) => {
    if (filter.productId === 'product-3') throw new Error('write-3')
    return {}
  })

  const first = await buildProductSalesStats()

  expect(first.productsProcessed).toBe(10)
  expect(first.productsSucceeded).toBe(9)
  expect(first.errors).toEqual([{ productId: 'product-3', error: 'write-3' }])

  statsUpdate.mockResolvedValue({})
  const second = await buildProductSalesStats()

  expect(second.productsSucceeded).toBe(10)
  expect(second.errors).toEqual([])
  expect(statsUpdate).toHaveBeenCalledTimes(20)
})

test('treats a null upsert result as a product error', async () => {
  jest.clearAllMocks()
  arrangeBuilder(1)
  statsUpdate.mockResolvedValue(null)

  const result = await buildProductSalesStats()

  expect(result.productsSucceeded).toBe(0)
  expect(result.errors).toEqual([
    { productId: 'product-0', error: 'Product Sales Stats upsert não devolveu documento' },
  ])
})
