import {
  UsersV2StatsService,
  type Clock,
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
