const mockFindUserProducts = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockFindUserProducts },
}))

import { getUsersByProduct } from '../../src/services/userProducts/userProductService'

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
