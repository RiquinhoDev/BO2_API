export interface MultiPlatformAnalyticsSnapshot {
  totalUsers: number
  activeUsers: number
  hotmartUsers: number
  curseducaUsers: number
  discordUsers: number
  multiPlatformUsers: number
  engagement: {
    hotmart: { total: number; sum: number }
    curseduca: { total: number; sum: number }
    combined: { total: number; sum: number }
  }
}

export interface MultiPlatformAnalyticsReader {
  read(): Promise<MultiPlatformAnalyticsSnapshot>
}

export interface PlatformEngagement {
  total: number
  sum: number
  avg: number
}

export interface MultiPlatformAnalyticsResult {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  platformStats: {
    hotmartUsers: number
    curseducaUsers: number
    discordUsers: number
    multiPlatformUsers: number
  }
  engagement: {
    hotmart: PlatformEngagement
    curseduca: PlatformEngagement
    combined: PlatformEngagement
  }
  insights: {
    platformDiversity: string
    mostPopular: 'Hotmart' | 'Curseduca' | 'Discord'
    bestEngagement:
      | 'Hotmart tem melhor engagement'
      | 'Curseduca tem melhor engagement'
  }
}

export class MultiPlatformAnalyticsService {
  constructor(private readonly reader: MultiPlatformAnalyticsReader) {}

  async get(): Promise<MultiPlatformAnalyticsResult> {
    const snapshot = await this.reader.read()
    const hotmart = this.withAverage(snapshot.engagement.hotmart)
    const curseduca = this.withAverage(snapshot.engagement.curseduca)
    const combined = this.withAverage(snapshot.engagement.combined)
    const mostPopular = snapshot.hotmartUsers > snapshot.curseducaUsers
      && snapshot.hotmartUsers > snapshot.discordUsers
      ? 'Hotmart'
      : snapshot.curseducaUsers > snapshot.discordUsers
        ? 'Curseduca'
        : 'Discord'

    return {
      totalUsers: snapshot.totalUsers,
      activeUsers: snapshot.activeUsers,
      inactiveUsers: snapshot.totalUsers - snapshot.activeUsers,
      platformStats: {
        hotmartUsers: snapshot.hotmartUsers,
        curseducaUsers: snapshot.curseducaUsers,
        discordUsers: snapshot.discordUsers,
        multiPlatformUsers: snapshot.multiPlatformUsers,
      },
      engagement: { hotmart, curseduca, combined },
      insights: {
        platformDiversity: snapshot.multiPlatformUsers > 0
          ? `${((snapshot.multiPlatformUsers / snapshot.totalUsers) * 100).toFixed(1)}% dos utilizadores estÃƒÂ£o em mÃƒÂºltiplas plataformas`
          : 'Nenhum utilizador em mÃƒÂºltiplas plataformas',
        mostPopular,
        bestEngagement: hotmart.avg > curseduca.avg
          ? 'Hotmart tem melhor engagement'
          : 'Curseduca tem melhor engagement',
      },
    }
  }

  private withAverage({ total, sum }: { total: number; sum: number }): PlatformEngagement {
    return { total, sum, avg: total === 0 ? 0 : sum / total }
  }
}
