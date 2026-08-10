const mockProductLean = jest.fn()
const mockProductSelect = jest.fn(() => ({
  lean: mockProductLean,
}))
const mockProductPopulate = jest.fn()
const mockProductFind = jest.fn(() => ({
  select: mockProductSelect,
  populate: mockProductPopulate,
}))

const mockUserProductLean = jest.fn()
const mockUserProductSelect = jest.fn(() => ({
  lean: mockUserProductLean,
}))
const mockUserProductPopulate = jest.fn()
const mockUserProductFind = jest.fn(() => ({
  select: mockUserProductSelect,
  populate: mockUserProductPopulate,
}))

jest.mock('../../../src/models/product/Product', () => ({
  __esModule: true,
  default: {
    find: mockProductFind,
  },
}))

jest.mock('../../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    find: mockUserProductFind,
  },
}))

import { MongooseUsersV2ComparisonReader } from '../../../src/services/users/mongooseUsersV2Comparison.reader'

describe('MongooseUsersV2ComparisonReader', () => {
  it('returns projected products and active enrollments in exactly two reads', async () => {
    mockProductLean.mockResolvedValue([
      {
        _id: { toString: () => 'product-a' },
        name: 'Product A',
        platform: 'hotmart',
      },
      {
        _id: { toString: () => 'product-b' },
        name: 'Product B',
        platform: 'curseduca',
      },
    ])
    mockUserProductLean.mockResolvedValue([
      {
        userId: { toString: () => 'user-a' },
        productId: { toString: () => 'product-a' },
        platform: 'hotmart',
        engagement: { engagementScore: 80 },
      },
      {
        userId: { toString: () => 'user-b' },
        productId: { toString: () => 'product-b' },
        platform: 'curseduca',
        engagement: { alternativeEngagement: 40 },
      },
    ])
    const reader = new MongooseUsersV2ComparisonReader()

    await expect(reader.read()).resolves.toEqual({
      products: [
        { id: 'product-a', name: 'Product A', platform: 'hotmart' },
        { id: 'product-b', name: 'Product B', platform: 'curseduca' },
      ],
      enrollments: [
        {
          userId: 'user-a',
          productId: 'product-a',
          platform: 'hotmart',
          engagement: { engagementScore: 80 },
        },
        {
          userId: 'user-b',
          productId: 'product-b',
          platform: 'curseduca',
          engagement: { alternativeEngagement: 40 },
        },
      ],
    })
    expect(mockProductFind).toHaveBeenCalledTimes(1)
    expect(mockProductFind).toHaveBeenCalledWith({})
    expect(mockProductSelect).toHaveBeenCalledWith('_id name platform')
    expect(mockProductLean).toHaveBeenCalledTimes(1)
    expect(mockUserProductFind).toHaveBeenCalledTimes(1)
    expect(mockUserProductFind).toHaveBeenCalledWith({ status: 'ACTIVE' })
    expect(mockUserProductSelect).toHaveBeenCalledWith(
      'userId productId platform engagement',
    )
    expect(mockUserProductLean).toHaveBeenCalledTimes(1)
    expect(mockProductFind.mock.calls.length + mockUserProductFind.mock.calls.length)
      .toBe(2)
    expect(mockProductPopulate).not.toHaveBeenCalled()
    expect(mockUserProductPopulate).not.toHaveBeenCalled()
  })
})
