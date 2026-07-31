import {
  UsersV2OverviewAnalyticsService,
  type UsersV2OverviewAnalyticsReader,
  type UsersV2OverviewAnalyticsSnapshot,
} from '../../../src/services/users/usersV2OverviewAnalytics.service'

function createHarness(snapshot: UsersV2OverviewAnalyticsSnapshot): {
  service: UsersV2OverviewAnalyticsService
  read: jest.MockedFunction<UsersV2OverviewAnalyticsReader['read']>
} {
  const read = jest.fn<
    ReturnType<UsersV2OverviewAnalyticsReader['read']>,
    Parameters<UsersV2OverviewAnalyticsReader['read']>
  >().mockResolvedValue(snapshot)

  return {
    service: new UsersV2OverviewAnalyticsService({ read }),
    read,
  }
}

describe('UsersV2OverviewAnalyticsService', () => {
  it('returns a finite empty response for a zero snapshot', async () => {
    const harness = createHarness({
      overview: {
        totalUsers: 0,
        totalActiveUsers: 0,
        totalProducts: 0,
        progressByUser: [],
      },
      byPlatform: [],
      byProduct: [],
    })

    await expect(harness.service.get()).resolves.toEqual({
      success: true,
      data: {
        overview: {
          totalUsers: 0,
          totalActiveUsers: 0,
          totalProducts: 0,
          avgProgress: 0,
        },
        byPlatform: [],
        byProduct: [],
      },
    })
    expect(harness.read).toHaveBeenCalledTimes(1)
  })

  it('uses equal user weighting and deterministic platform ordering', async () => {
    const harness = createHarness({
      overview: {
        totalUsers: 4,
        totalActiveUsers: 3,
        totalProducts: 2,
        progressByUser: [
          { userId: 'user-a', averageProgress: 10 },
          { userId: 'user-b', averageProgress: 80 },
          { userId: 'user-c', averageProgress: 30 },
          { userId: 'user-d', averageProgress: 20 },
        ],
      },
      byPlatform: [
        { platform: 'hotmart', userCount: 2 },
        { platform: 'discord', userCount: 1 },
        { platform: 'curseduca', userCount: 2 },
      ],
      byProduct: [],
    })

    await expect(harness.service.get()).resolves.toEqual({
      success: true,
      data: {
        overview: {
          totalUsers: 4,
          totalActiveUsers: 3,
          totalProducts: 2,
          avgProgress: 35,
        },
        byPlatform: [
          { platform: 'curseduca', userCount: 2, percentage: 50 },
          { platform: 'hotmart', userCount: 2, percentage: 50 },
          { platform: 'discord', userCount: 1, percentage: 25 },
        ],
        byProduct: [],
      },
    })
  })

  it('clamps finite product progress and computes distinct-count rates', async () => {
    const harness = createHarness({
      overview: {
        totalUsers: 3,
        totalActiveUsers: 2,
        totalProducts: 3,
        progressByUser: [
          { userId: 'user-a', averageProgress: Number.NaN },
          { userId: 'user-b', averageProgress: Number.POSITIVE_INFINITY },
          { userId: 'user-c', averageProgress: 60 },
        ],
      },
      byPlatform: [
        { platform: 'hotmart', userCount: Number.POSITIVE_INFINITY },
      ],
      byProduct: [
        {
          productId: 'product-z',
          productName: 'Product Z',
          platform: 'hotmart',
          totalUsers: 2,
          activeUsers: 1,
          progressSum: 250,
          progressCount: 2,
        },
        {
          productId: 'product-a',
          productName: 'Product A',
          platform: 'curseduca',
          totalUsers: 2,
          activeUsers: 2,
          progressSum: -20,
          progressCount: 2,
        },
        {
          productId: 'product-empty',
          productName: 'No Progress',
          platform: 'discord',
          totalUsers: 1,
          activeUsers: 0,
          progressSum: Number.NaN,
          progressCount: 0,
        },
      ],
    })

    await expect(harness.service.get()).resolves.toEqual({
      success: true,
      data: {
        overview: {
          totalUsers: 3,
          totalActiveUsers: 2,
          totalProducts: 3,
          avgProgress: 20,
        },
        byPlatform: [
          { platform: 'hotmart', userCount: 0, percentage: 0 },
        ],
        byProduct: [
          {
            productId: 'product-a',
            productName: 'Product A',
            platform: 'curseduca',
            totalUsers: 2,
            activeUsers: 2,
            avgProgress: 0,
            activeRate: 100,
          },
          {
            productId: 'product-z',
            productName: 'Product Z',
            platform: 'hotmart',
            totalUsers: 2,
            activeUsers: 1,
            avgProgress: 100,
            activeRate: 50,
          },
          {
            productId: 'product-empty',
            productName: 'No Progress',
            platform: 'discord',
            totalUsers: 1,
            activeUsers: 0,
            avgProgress: 0,
            activeRate: 0,
          },
        ],
      },
    })
  })

  it('rounds derived fractions to one decimal and sorts products by count then id', async () => {
    const harness = createHarness({
      overview: {
        totalUsers: 3,
        totalActiveUsers: 2,
        totalProducts: 2,
        progressByUser: [
          { userId: 'user-a', averageProgress: 10 },
          { userId: 'user-b', averageProgress: 20 },
          { userId: 'user-c', averageProgress: 30 },
        ],
      },
      byPlatform: [
        { platform: 'hotmart', userCount: 2 },
      ],
      byProduct: [
        {
          productId: 'product-b',
          productName: 'B',
          platform: 'hotmart',
          totalUsers: 3,
          activeUsers: 2,
          progressSum: 100,
          progressCount: 3,
        },
        {
          productId: 'product-a',
          productName: 'A',
          platform: 'curseduca',
          totalUsers: 3,
          activeUsers: 1,
          progressSum: 200,
          progressCount: 3,
        },
      ],
    })

    const result = await harness.service.get()

    expect(result.data.byPlatform).toEqual([
      { platform: 'hotmart', userCount: 2, percentage: 66.7 },
    ])
    expect(result.data.byProduct).toEqual([
      expect.objectContaining({
        productId: 'product-a',
        avgProgress: 66.7,
        activeRate: 33.3,
      }),
      expect.objectContaining({
        productId: 'product-b',
        avgProgress: 33.3,
        activeRate: 66.7,
      }),
    ])
  })
})
