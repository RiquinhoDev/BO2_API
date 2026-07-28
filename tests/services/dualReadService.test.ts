const mockUserLean = jest.fn()
const mockUserFind = jest.fn(() => ({ lean: mockUserLean }))
const mockUserProductLean = jest.fn()
const mockUserProductQuery = {
  populate: jest.fn(),
  lean: mockUserProductLean,
}
const mockUserProductFind = jest.fn(() => mockUserProductQuery)
const mockProductLean = jest.fn()
const mockProductFind = jest.fn(() => ({ lean: mockProductLean }))

mockUserProductQuery.populate.mockReturnValue(mockUserProductQuery)

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockUserFind },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockUserProductFind },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { find: mockProductFind },
}))

import { getAllUsersUnified } from '../../src/services/syncUtilizadoresServices/dualReadService'

describe('dual read Hotmart fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserProductQuery.populate.mockReturnValue(mockUserProductQuery)
    mockUserProductLean.mockResolvedValue([])
  })

  it('derives progress from the persisted lesson completion data', async () => {
    const lastAccessDate = new Date('2026-07-20T12:00:00Z')
    mockUserLean.mockResolvedValue([{
      _id: 'user-1',
      name: 'Student',
      email: 'student@example.test',
      hotmart: {
        hotmartUserId: 'hotmart-1',
        lastAccessDate,
        progress: {
          lastAccessDate,
          completedLessons: 2,
          lessonsData: [
            { completed: true },
            { completed: true },
            { completed: false },
            { completed: false },
          ],
        },
        engagement: {
          accessCount: 3,
        },
      },
    }])
    mockProductLean.mockResolvedValue([{
      _id: 'product-1',
      name: 'OGI',
      code: 'OGI',
      platform: 'hotmart',
      isActive: true,
    }])

    const result = await getAllUsersUnified()

    expect(result).toHaveLength(1)
    expect(result[0]?.progress?.percentage).toBe(50)
  })
})
