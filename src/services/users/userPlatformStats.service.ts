/**
 * Platform + engagement summary behind GET /api/users/stats and /getUserStats.
 * The reader owns every Mongoose read; the service assembles the flat response.
 * Distinct from userStatsOverview (enrollment breakdown) and studentStats.
 */

export interface PlatformEngagement {
  averageScore: number
  topPerformers: number
  needsAttention: number
}

export interface PlatformCounts {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  hotmartUsers: number
  curseducaUsers: number
  discordUsers: number
  multiPlatformUsers: number
  bothPlatforms: number
  usersWithEngagement: number
  engagement: PlatformEngagement
}

export interface UserPlatformStats {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  bothPlatforms: number
  platformStats: {
    hotmartUsers: number
    discordUsers: number
    curseducaUsers: number
    multiPlatformUsers: number
  }
  withEngagement: number
  averageEngagement: number
  topPerformersCount: number
  needsAttentionCount: number
}

export interface UserPlatformStatsReader {
  read(): Promise<PlatformCounts>
}

export class UserPlatformStatsService {
  constructor(private readonly reader: UserPlatformStatsReader) {}

  async get(): Promise<UserPlatformStats> {
    const counts = await this.reader.read()

    return {
      totalUsers: counts.totalUsers,
      activeUsers: counts.activeUsers,
      inactiveUsers: counts.inactiveUsers,
      bothPlatforms: counts.bothPlatforms,
      platformStats: {
        hotmartUsers: counts.hotmartUsers,
        discordUsers: counts.discordUsers,
        curseducaUsers: counts.curseducaUsers,
        multiPlatformUsers: counts.multiPlatformUsers,
      },
      withEngagement: counts.usersWithEngagement,
      averageEngagement: Math.round(counts.engagement.averageScore * 100) / 100,
      topPerformersCount: counts.engagement.topPerformers,
      needsAttentionCount: counts.engagement.needsAttention,
    }
  }
}
