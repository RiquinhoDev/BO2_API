import mongoose from 'mongoose'

const mockFindUserProducts = jest.fn()
const mockFindUsers = jest.fn()
const mockFindProducts = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockFindUsers },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { find: mockFindProducts },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockFindUserProducts },
}))

import {
  getUsersByProduct,
  getUsersForProduct,
} from '../../src/services/userProducts/userProductService'

function projectedQuery<T>(rows: T[]) {
  const lean = jest.fn().mockResolvedValue(rows)
  const select = jest.fn(() => ({ lean }))
  return { lean, select }
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('sources the legacy response alias from canonical progress.percentage', async () => {
  const query = {
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([{
      _id: 'user-product-id',
      userId: { _id: 'user-id', email: 'student@example.test', name: 'Student' },
      productId: { _id: 'product-id', name: 'Course' },
      progress: { percentage: 42, progressPercentage: 99 },
    }]),
  }
  mockFindUserProducts.mockReturnValue(query)

  const users = await getUsersByProduct('product-id')

  expect(users[0].products[0].progress).toMatchObject({
    percentage: 42,
    progressPercentage: 42,
  })
})

describe('getUsersForProduct', () => {
  it('omits missing and soft-deleted users from grouped results', async () => {
    const productId = new mongoose.Types.ObjectId('a'.repeat(24))
    const missingUserId = new mongoose.Types.ObjectId('b'.repeat(24))
    const deletedUserId = new mongoose.Types.ObjectId('c'.repeat(24))
    const activeUserId = new mongoose.Types.ObjectId('d'.repeat(24))
    mockFindUserProducts.mockReturnValue(projectedQuery([
      {
        _id: new mongoose.Types.ObjectId('1'.repeat(24)),
        userId: missingUserId,
        productId,
        platform: 'hotmart',
        status: 'ACTIVE',
      },
      {
        _id: new mongoose.Types.ObjectId('2'.repeat(24)),
        userId: deletedUserId,
        productId,
        platform: 'hotmart',
        status: 'ACTIVE',
      },
      {
        _id: new mongoose.Types.ObjectId('3'.repeat(24)),
        userId: activeUserId,
        productId,
        platform: 'hotmart',
        status: 'ACTIVE',
      },
    ]))
    mockFindUsers.mockReturnValue(projectedQuery([
      {
        _id: deletedUserId,
        name: 'Deleted',
        email: 'deleted@example.test',
        isDeleted: true,
      },
      {
        _id: activeUserId,
        name: 'Active',
        email: 'active@example.test',
        combined: { status: 'ACTIVE' },
      },
    ]))
    mockFindProducts.mockReturnValue(projectedQuery([{
      _id: productId,
      name: 'Course',
      code: 'course',
      platform: 'hotmart',
    }]))

    const result = await getUsersForProduct(productId.toString())

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      _id: activeUserId,
      name: 'Active',
      email: 'active@example.test',
      status: 'ACTIVE',
    })
  })

  it('keeps missing and null product fallbacks while preserving numeric zero', async () => {
    const requestedProductId = new mongoose.Types.ObjectId('a'.repeat(24))
    const missingProductId = new mongoose.Types.ObjectId('e'.repeat(24))
    const userId = new mongoose.Types.ObjectId('d'.repeat(24))
    const missingProductEnrollmentId = new mongoose.Types.ObjectId(
      '1'.repeat(24),
    )
    const nullProductEnrollmentId = new mongoose.Types.ObjectId('2'.repeat(24))
    mockFindUserProducts.mockReturnValue(projectedQuery([
      {
        _id: missingProductEnrollmentId,
        userId,
        productId: missingProductId,
        platform: 'hotmart',
        status: 'ACTIVE',
        progress: { percentage: 0 },
        engagement: {
          engagementScore: 0,
          engagementLevel: 'NONE',
        },
      },
      {
        _id: nullProductEnrollmentId,
        userId,
        productId: null,
        platform: 'discord',
        status: 'ACTIVE',
      },
    ]))
    mockFindUsers.mockReturnValue(projectedQuery([{
      _id: userId,
      name: 'Active',
      email: 'active@example.test',
      combined: { status: 'ACTIVE' },
    }]))
    mockFindProducts.mockReturnValue(projectedQuery([]))

    const result = await getUsersForProduct(requestedProductId.toString())

    expect(result[0].products).toEqual([
      {
        _id: missingProductEnrollmentId,
        product: missingProductId,
        platform: 'hotmart',
        status: 'ACTIVE',
        enrolledAt: undefined,
        isPrimary: undefined,
        progress: {
          percentage: 0,
          lastActivity: undefined,
        },
        engagement: {
          score: 0,
          level: 'NONE',
          lastAction: undefined,
        },
      },
      {
        _id: nullProductEnrollmentId,
        product: null,
        platform: 'discord',
        status: 'ACTIVE',
        enrolledAt: undefined,
        isPrimary: undefined,
        progress: {
          percentage: 0,
          lastActivity: undefined,
        },
        engagement: {
          score: 0,
          level: 'NONE',
          lastAction: undefined,
        },
      },
    ])
  })

  it('loads all products for matched users with a constant number of reads', async () => {
    const requestedProductId = new mongoose.Types.ObjectId('a'.repeat(24))
    const firstProductId = new mongoose.Types.ObjectId('e'.repeat(24))
    const secondProductId = new mongoose.Types.ObjectId('f'.repeat(24))
    const userId = new mongoose.Types.ObjectId('d'.repeat(24))
    const matchingQuery = projectedQuery([{
      userId,
      productId: requestedProductId,
    }])
    const userProductQuery = projectedQuery([
      {
        _id: new mongoose.Types.ObjectId('1'.repeat(24)),
        userId,
        productId: firstProductId,
        platform: 'hotmart',
        status: 'ACTIVE',
      },
      {
        _id: new mongoose.Types.ObjectId('2'.repeat(24)),
        userId,
        productId: secondProductId,
        status: 'ACTIVE',
      },
    ])
    const userQuery = projectedQuery([{
      _id: userId,
      name: 'Active',
      email: 'active@example.test',
      combined: { status: 'ACTIVE' },
    }])
    const firstProduct = {
      _id: firstProductId,
      name: 'First',
      code: 'first',
      platform: 'hotmart',
    }
    const secondProduct = {
      _id: secondProductId,
      name: 'Second',
      code: 'second',
      platform: 'curseduca',
    }
    const productQuery = projectedQuery([firstProduct, secondProduct])
    mockFindUserProducts
      .mockReturnValueOnce(matchingQuery)
      .mockReturnValueOnce(userProductQuery)
    mockFindUsers.mockReturnValue(userQuery)
    mockFindProducts.mockReturnValue(productQuery)

    const result = await getUsersForProduct(requestedProductId.toString())

    expect(result).toHaveLength(1)
    expect(result[0].products[0].product).toEqual(firstProduct)
    expect(result[0].products[1].product).toEqual(secondProduct)
    expect(result[0].products[0].platform).toBe('hotmart')
    expect(result[0].products[1].platform).toBe('curseduca')
    expect(mockFindUserProducts).toHaveBeenCalledTimes(2)
    expect(mockFindUserProducts).toHaveBeenNthCalledWith(1, {
      productId: requestedProductId,
    })
    expect(mockFindUserProducts).toHaveBeenNthCalledWith(2, {
      userId: { $in: [userId] },
    })
    expect(mockFindUsers).toHaveBeenCalledTimes(1)
    expect(mockFindProducts).toHaveBeenCalledTimes(1)
    expect(matchingQuery.select).toHaveBeenCalledTimes(1)
    expect(userProductQuery.select).toHaveBeenCalledTimes(1)
    expect(userQuery.select).toHaveBeenCalledTimes(1)
    expect(productQuery.select).toHaveBeenCalledTimes(1)
  })
})
