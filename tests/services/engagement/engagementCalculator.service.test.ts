const mockUserProductFind = jest.fn()

jest.mock('../../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    find: mockUserProductFind,
  },
}))

import {
  calculateBatchAverageEngagement,
  calculateUserAverageEngagement,
} from '../../../src/services/syncUtilizadoresServices/engagement/engagementCalculator.service'

function mockProducts(products: unknown[]): void {
  mockUserProductFind.mockReturnValue({
    lean: jest.fn().mockResolvedValue(products),
  })
}

describe('engagementCalculator.service', () => {
  beforeEach(() => {
    mockUserProductFind.mockReset()
  })

  it('averages active Hotmart and CursEduca products into a rounded score', async () => {
    mockProducts([
      { platform: 'hotmart', engagement: { engagementScore: 80 } },
      { platform: 'curseduca', engagement: { engagementScore: 40 } },
    ])

    await expect(calculateUserAverageEngagement('user-1')).resolves.toMatchObject({
      userId: 'user-1',
      averageScore: 60,
      totalPlatforms: 2,
      breakdown: [
        { platform: 'hotmart', normalizedScore: 80 },
        { platform: 'curseduca', normalizedScore: 40 },
      ],
    })
  })

  it('returns averages for active users and zero for requested users without products', async () => {
    mockProducts([
      { userId: 'user-1', platform: 'hotmart', engagement: { engagementScore: 80 } },
      { userId: 'user-1', platform: 'curseduca', engagement: { engagementScore: 40 } },
    ])

    const results = await calculateBatchAverageEngagement(['user-1', 'user-2'])

    expect(results.get('user-1')).toMatchObject({
      userId: 'user-1',
      averageScore: 60,
      totalPlatforms: 2,
      breakdown: [
        { platform: 'hotmart', normalizedScore: 80 },
        { platform: 'curseduca', normalizedScore: 40 },
      ],
    })
    expect(results.get('user-2')).toEqual({
      userId: 'user-2',
      averageScore: 0,
      level: 'MUITO_BAIXO',
      breakdown: [],
      totalPlatforms: 0,
    })
  })

  it('does not add unknown-platform engagement to the normalized breakdown', async () => {
    mockProducts([
      { platform: 'future-platform', engagement: { engagementScore: 90 } },
    ])

    await expect(calculateUserAverageEngagement('user-1')).resolves.toEqual({
      userId: 'user-1',
      averageScore: 0,
      level: 'MUITO_BAIXO',
      breakdown: [],
      totalPlatforms: 1,
    })
  })
})
