/**
 * Consolidated dashboard stats behind GET /api/users/dashboard-stats.
 * The reader owns every Mongoose read; the service derives the response fields
 * and assembles the envelope. Ports live here with the service.
 */

export interface DashboardEngagement {
  avgScore: number
  topPerformers: number
  needsAttention: number
  withEngagement: number
}

/** Raw counts the reader supplies, before any derivation. */
export interface DashboardCounts {
  totalUsers: number
  activeUsers: number
  hotmartUsers: number
  curseducaUsers: number
  discordUsers: number
  bothHotmartAndCurseduca: number
  hotmartOnly: number
  curseducaOnly: number
  noPlatform: number
  engagement: DashboardEngagement
  lastHotmartSync: Date | null
  lastCurseducaSync: Date | null
}

export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  withProgress: number
  withEngagement: number
  averageEngagement: number
  topPerformersCount: number
  needsAttentionCount: number
  platformStats: {
    hotmartUsers: number
    curseducaUsers: number
    discordUsers: number
    multiPlatformUsers: number
  }
  platformDistribution: {
    hotmartOnly: number
    curseducaOnly: number
    bothPlatforms: number
    noPlatform: number
  }
  lastHotmartSync: Date | null
  lastCurseducaSync: Date | null
}

export interface UserDashboardStatsReader {
  read(): Promise<DashboardCounts>
}

export class UserDashboardStatsService {
  constructor(private readonly reader: UserDashboardStatsReader) {}

  async get(): Promise<DashboardStats> {
    const counts = await this.reader.read()
    const { engagement } = counts

    const withEngagement = engagement.withEngagement || 0
    const averageEngagement = engagement.avgScore || 0
    // Overflow proxy for multi-platform membership, preserved verbatim.
    const multiPlatformUsers = Math.max(
      0,
      (counts.hotmartUsers + counts.curseducaUsers + counts.discordUsers) - counts.totalUsers,
    )

    return {
      totalUsers: counts.totalUsers,
      activeUsers: counts.activeUsers,
      inactiveUsers: counts.totalUsers - counts.activeUsers,
      withProgress: withEngagement,
      withEngagement,
      averageEngagement: Math.round(averageEngagement * 100) / 100,
      topPerformersCount: engagement.topPerformers || 0,
      needsAttentionCount: engagement.needsAttention || 0,
      platformStats: {
        hotmartUsers: counts.hotmartUsers,
        curseducaUsers: counts.curseducaUsers,
        discordUsers: counts.discordUsers,
        multiPlatformUsers,
      },
      platformDistribution: {
        hotmartOnly: counts.hotmartOnly,
        curseducaOnly: counts.curseducaOnly,
        bothPlatforms: counts.bothHotmartAndCurseduca,
        noPlatform: counts.noPlatform,
      },
      lastHotmartSync: counts.lastHotmartSync,
      lastCurseducaSync: counts.lastCurseducaSync,
    }
  }
}
