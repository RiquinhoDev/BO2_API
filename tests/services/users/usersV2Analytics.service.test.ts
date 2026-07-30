import {
  UsersV2ComparisonService,
  UsersV2StatsService,
  type Clock,
  type UsersV2ComparisonEnrollment,
  type UsersV2ComparisonReader,
  type UsersV2ComparisonSnapshot,
  type UsersV2StatsReader,
  type UsersV2StatsSnapshot,
} from '../../../src/services/users/usersV2Analytics.service'

const fixedNow = new Date('2026-07-30T12:00:00.000Z')

function createHarness(snapshot: UsersV2StatsSnapshot): {
  service: UsersV2StatsService
  read: jest.MockedFunction<UsersV2StatsReader['read']>
  now: jest.MockedFunction<Clock['now']>
} {
  const read = jest.fn<ReturnType<UsersV2StatsReader['read']>, Parameters<UsersV2StatsReader['read']>>()
    .mockResolvedValue(snapshot)
  const now = jest.fn<ReturnType<Clock['now']>, Parameters<Clock['now']>>()
    .mockReturnValue(fixedNow)

  return {
    service: new UsersV2StatsService({ read }, { now }),
    read,
    now,
  }
}

describe('UsersV2StatsService', () => {
  it('builds the complete compatible stats response from enrollment totals', async () => {
    const harness = createHarness({
      totalStudents: 8,
      engagementSum: 520,
      progressSum: 360,
      atRiskCount: 2,
      inactive30d: 3,
      new7d: 1,
      activeProducts: 3,
      byPlatform: [
        { platform: 'curseduca', count: 3 },
        { platform: 'unknown', count: 1 },
        { platform: 'hotmart', count: 4 },
      ],
    })

    await expect(harness.service.get()).resolves.toEqual({
      success: true,
      data: {
        overview: {
          totalStudents: 8,
          avgEngagement: 65,
          avgProgress: 45,
          activeCount: 8,
          activeRate: 100,
          atRiskCount: 2,
          atRiskRate: 25,
          activeProducts: 3,
          healthScore: 81,
          healthLevel: 'BOM',
          healthBreakdown: {
            engagement: 65,
            retention: 100,
            growth: 100,
            progress: 45,
          },
        },
        byPlatform: [
          { name: 'Hotmart', count: 4, percentage: 50, icon: '🔥' },
          { name: 'Curseduca', count: 3, percentage: 37.5, icon: '📚' },
          { name: 'Unknown', count: 1, percentage: 12.5, icon: '🌟' },
        ],
        quickFilters: {
          atRisk: 2,
          topPerformers: 1,
          inactive30d: 3,
          new7d: 1,
        },
        meta: {
          calculatedAt: '2026-07-30T12:00:00.000Z',
          durationMs: 0,
        },
      },
    })
    expect(harness.now).toHaveBeenCalledTimes(1)
    expect(harness.read).toHaveBeenCalledTimes(1)
    expect(harness.read).toHaveBeenCalledWith(fixedNow)
  })

  it('returns finite zero values and no platforms for an empty snapshot', async () => {
    const harness = createHarness({
      totalStudents: 0,
      engagementSum: 0,
      progressSum: 0,
      atRiskCount: 0,
      inactive30d: 0,
      new7d: 0,
      activeProducts: 0,
      byPlatform: [],
    })

    await expect(harness.service.get()).resolves.toEqual({
      success: true,
      data: {
        overview: {
          totalStudents: 0,
          avgEngagement: 0,
          avgProgress: 0,
          activeCount: 0,
          activeRate: 0,
          atRiskCount: 0,
          atRiskRate: 0,
          activeProducts: 0,
          healthScore: 0,
          healthLevel: 'CRÍTICO',
          healthBreakdown: {
            engagement: 0,
            retention: 0,
            growth: 0,
            progress: 0,
          },
        },
        byPlatform: [],
        quickFilters: {
          atRisk: 0,
          topPerformers: 0,
          inactive30d: 0,
          new7d: 0,
        },
        meta: {
          calculatedAt: '2026-07-30T12:00:00.000Z',
          durationMs: 0,
        },
      },
    })
    expect(harness.now).toHaveBeenCalledTimes(1)
    expect(harness.read).toHaveBeenCalledTimes(1)
    expect(harness.read).toHaveBeenCalledWith(fixedNow)
  })
})

function createComparisonHarness(snapshot: UsersV2ComparisonSnapshot): {
  service: UsersV2ComparisonService
  read: jest.MockedFunction<UsersV2ComparisonReader['read']>
} {
  const read = jest.fn<
    ReturnType<UsersV2ComparisonReader['read']>,
    Parameters<UsersV2ComparisonReader['read']>
  >().mockResolvedValue(snapshot)

  return {
    service: new UsersV2ComparisonService({ read }),
    read,
  }
}

describe('UsersV2ComparisonService', () => {
  it('uses each user normalized positive-score average in every product distribution', async () => {
    const harness = createComparisonHarness({
      products: [
        { id: 'product-b', name: 'Hotmart Main', platform: 'hotmart' },
        { id: 'product-a', name: 'CursEduca Main', platform: 'curseduca' },
        { id: 'product-c', name: 'Discord Main', platform: 'discord' },
        { id: 'product-d', name: 'Low Band', platform: 'hotmart' },
        { id: 'product-e', name: 'Empty', platform: 'discord' },
      ],
      enrollments: [
        {
          userId: 'shared-user',
          productId: 'product-b',
          platform: 'hotmart',
          engagement: { engagementScore: 80 },
        },
        {
          userId: 'shared-user',
          productId: 'product-a',
          platform: 'curseduca',
          engagement: { engagementScore: 40 },
        },
        {
          userId: 'shared-user',
          productId: 'product-c',
          platform: 'discord',
          engagement: { engagementScore: 0 },
        },
        {
          userId: 'risk-user',
          productId: 'product-b',
          platform: 'hotmart',
          engagement: { engagementScore: 20 },
        },
        {
          userId: 'medium-user',
          productId: 'product-b',
          platform: 'hotmart',
          engagement: { engagementScore: 40 },
        },
        {
          userId: 'low-user',
          productId: 'product-d',
          platform: 'hotmart',
          engagement: { engagementScore: 25 },
        },
      ],
    })

    await expect(harness.service.get()).resolves.toEqual([
      {
        productId: 'product-b',
        productName: 'Hotmart Main',
        platform: 'hotmart',
        totalStudents: 3,
        avgScore: 40,
        trend: 0,
        distribution: {
          alto: { count: 1, percentage: 33 },
          medio: { count: 1, percentage: 33 },
          baixo: { count: 0, percentage: 0 },
          risco: { count: 1, percentage: 33 },
        },
      },
      {
        productId: 'product-a',
        productName: 'CursEduca Main',
        platform: 'curseduca',
        totalStudents: 1,
        avgScore: 60,
        trend: 0,
        distribution: {
          alto: { count: 1, percentage: 100 },
          medio: { count: 0, percentage: 0 },
          baixo: { count: 0, percentage: 0 },
          risco: { count: 0, percentage: 0 },
        },
      },
      {
        productId: 'product-c',
        productName: 'Discord Main',
        platform: 'discord',
        totalStudents: 1,
        avgScore: 60,
        trend: 0,
        distribution: {
          alto: { count: 1, percentage: 100 },
          medio: { count: 0, percentage: 0 },
          baixo: { count: 0, percentage: 0 },
          risco: { count: 0, percentage: 0 },
        },
      },
      {
        productId: 'product-d',
        productName: 'Low Band',
        platform: 'hotmart',
        totalStudents: 1,
        avgScore: 25,
        trend: 0,
        distribution: {
          alto: { count: 0, percentage: 0 },
          medio: { count: 0, percentage: 0 },
          baixo: { count: 1, percentage: 100 },
          risco: { count: 0, percentage: 0 },
        },
      },
      {
        productId: 'product-e',
        productName: 'Empty',
        platform: 'discord',
        totalStudents: 0,
        avgScore: 0,
        trend: 0,
        distribution: {
          alto: { count: 0, percentage: 0 },
          medio: { count: 0, percentage: 0 },
          baixo: { count: 0, percentage: 0 },
          risco: { count: 0, percentage: 0 },
        },
      },
    ])
    expect(harness.read).toHaveBeenCalledTimes(1)
  })

  it('reads enrollment elements exactly twice regardless of product count', async () => {
    let elementReads = 0
    const enrollments: UsersV2ComparisonEnrollment[] = [
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
        engagement: { engagementScore: 40 },
      },
      {
        userId: 'user-c',
        productId: 'product-c',
        platform: 'discord',
        engagement: { engagementScore: 100 },
      },
    ]
    const countedEnrollments = new Proxy(enrollments, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          elementReads += 1
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const harness = createComparisonHarness({
      products: [
        { id: 'product-a', name: 'A', platform: 'hotmart' },
        { id: 'product-b', name: 'B', platform: 'curseduca' },
        { id: 'product-c', name: 'C', platform: 'discord' },
        { id: 'product-d', name: 'D', platform: 'hotmart' },
        { id: 'product-e', name: 'E', platform: 'curseduca' },
      ],
      enrollments: countedEnrollments,
    })

    await harness.service.get()

    expect(elementReads).toBe(enrollments.length * 2)
  })
})
