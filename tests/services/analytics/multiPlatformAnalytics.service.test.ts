import {
  MultiPlatformAnalyticsService,
  type MultiPlatformAnalyticsReader,
  type MultiPlatformAnalyticsSnapshot,
} from '../../../src/services/analytics/multiPlatformAnalytics.service'

const populatedSnapshot: MultiPlatformAnalyticsSnapshot = {
  totalUsers: 10,
  activeUsers: 6,
  hotmartUsers: 7,
  curseducaUsers: 5,
  discordUsers: 4,
  multiPlatformUsers: 3,
  engagement: {
    hotmart: { total: 2, sum: 160 },
    curseduca: { total: 2, sum: 140 },
    combined: { total: 3, sum: 225 },
  },
}

const readerWith = (snapshot: MultiPlatformAnalyticsSnapshot): MultiPlatformAnalyticsReader => ({
  read: async () => snapshot,
})

describe('MultiPlatformAnalyticsService', () => {
  it('returns the exact legacy result for a populated snapshot', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith(populatedSnapshot))

    await expect(service.get()).resolves.toEqual({
      totalUsers: 10,
      activeUsers: 6,
      inactiveUsers: 4,
      platformStats: {
        hotmartUsers: 7,
        curseducaUsers: 5,
        discordUsers: 4,
        multiPlatformUsers: 3,
      },
      engagement: {
        hotmart: { total: 2, sum: 160, avg: 80 },
        curseduca: { total: 2, sum: 140, avg: 70 },
        combined: { total: 3, sum: 225, avg: 75 },
      },
      insights: {
        platformDiversity:
          '30.0% dos utilizadores estão em múltiplas plataformas',
        mostPopular: 'Hotmart',
        bestEngagement: 'Hotmart tem melhor engagement',
      },
    })
  })

  it('returns zero averages and the legacy empty-diversity string for zero totals', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith({
      totalUsers: 0,
      activeUsers: 0,
      hotmartUsers: 0,
      curseducaUsers: 0,
      discordUsers: 0,
      multiPlatformUsers: 0,
      engagement: {
        hotmart: { total: 0, sum: 0 },
        curseduca: { total: 0, sum: 0 },
        combined: { total: 0, sum: 0 },
      },
    }))

    await expect(service.get()).resolves.toMatchObject({
      inactiveUsers: 0,
      engagement: {
        hotmart: { avg: 0 },
        curseduca: { avg: 0 },
        combined: { avg: 0 },
      },
      insights: {
        platformDiversity: 'Nenhum utilizador em múltiplas plataformas',
        mostPopular: 'Discord',
        bestEngagement: 'Curseduca tem melhor engagement',
      },
    })
  })

  it('selects Hotmart as most popular only when it is strictly greater than both alternatives', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith({
      ...populatedSnapshot,
      hotmartUsers: 8,
      curseducaUsers: 7,
      discordUsers: 6,
    }))

    await expect(service.get()).resolves.toMatchObject({
      insights: { mostPopular: 'Hotmart' },
    })
  })

  it('selects Curseduca as most popular only when it is strictly greater than Discord after Hotmart loses', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith({
      ...populatedSnapshot,
      hotmartUsers: 4,
      curseducaUsers: 6,
      discordUsers: 5,
    }))

    await expect(service.get()).resolves.toMatchObject({
      insights: { mostPopular: 'Curseduca' },
    })
  })

  it('does not select Hotmart when Hotmart and Curseduca tie above Discord', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith({
      ...populatedSnapshot,
      hotmartUsers: 5,
      curseducaUsers: 5,
      discordUsers: 4,
    }))

    await expect(service.get()).resolves.toMatchObject({
      insights: { mostPopular: 'Curseduca' },
    })
  })

  it('does not select Hotmart when Hotmart and Discord tie above Curseduca', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith({
      ...populatedSnapshot,
      hotmartUsers: 5,
      curseducaUsers: 4,
      discordUsers: 5,
    }))

    await expect(service.get()).resolves.toMatchObject({
      insights: { mostPopular: 'Discord' },
    })
  })

  it('resolves every remaining popularity tie to Discord', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith({
      ...populatedSnapshot,
      hotmartUsers: 5,
      curseducaUsers: 5,
      discordUsers: 5,
    }))

    await expect(service.get()).resolves.toMatchObject({
      insights: { mostPopular: 'Discord' },
    })
  })

  it('resolves equal engagement averages to Curseduca', async () => {
    const service = new MultiPlatformAnalyticsService(readerWith({
      ...populatedSnapshot,
      engagement: {
        hotmart: { total: 2, sum: 160 },
        curseduca: { total: 4, sum: 320 },
        combined: { total: 0, sum: 0 },
      },
    }))

    await expect(service.get()).resolves.toMatchObject({
      insights: { bestEngagement: 'Curseduca tem melhor engagement' },
    })
  })

  it('reads exactly once and propagates reader failures unchanged', async () => {
    const failure = new Error('reader unavailable')
    let calls = 0
    const reader: MultiPlatformAnalyticsReader = {
      read: async () => {
        calls += 1
        throw failure
      },
    }
    const service = new MultiPlatformAnalyticsService(reader)

    await expect(service.get()).rejects.toBe(failure)
    expect(calls).toBe(1)
  })
})
