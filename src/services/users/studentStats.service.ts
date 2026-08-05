import type {
  Clock,
  StudentStatsReader,
  StudentStatsResult,
  StudentStatsSource,
} from './studentStats.contract'

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,19}$/

function wholeDaysSince(reference: Date | undefined, now: Date): number | null {
  if (!reference) return null
  return Math.floor((now.getTime() - new Date(reference).getTime()) / MILLISECONDS_PER_DAY)
}

/**
 * `combined` is the canonical source; the platform fields are legacy fallbacks
 * consulted in the historical order hotmart -> curseduca.
 */
function resolveLastAccess(source: StudentStatsSource): Date | undefined {
  return source.combinedLastActivity
    || source.hotmartLastAccessDate
    || source.curseducaLastAccess
}

export class StudentStatsService {
  constructor(
    private readonly reader: StudentStatsReader,
    private readonly clock: Clock,
  ) {}

  async get(id: string): Promise<StudentStatsResult | null> {
    const source = await this.reader.findForStats(id)
    if (!source) return null

    const now = this.clock.now()
    const lastAccessDate = resolveLastAccess(source)
    const classId = source.combinedClassId || source.classId

    return {
      hasEmail: !!source.email,
      hasName: !!source.name,
      hasDiscordIds: source.discordIds.length > 0,
      totalDiscordIds: source.discordIds.length,
      isActive: source.combinedStatus === 'ACTIVE',
      hasProgress: source.totalProgress > 0,
      progressPercentage: source.totalProgress,
      hasPurchaseDate: !!source.hotmartPurchaseDate,
      hasLastAccess: !!lastAccessDate,
      daysSincePurchase: wholeDaysSince(source.hotmartPurchaseDate, now),
      daysSinceLastAccess: wholeDaysSince(lastAccessDate, now),
      hasClass: !!classId,
      classId,
      validationStatus: {
        email: !!source.email && EMAIL_PATTERN.test(source.email),
        // An empty list satisfies `every` vacuously — preserved from the legacy handler.
        discordIds: source.discordIds.every(id => DISCORD_SNOWFLAKE_PATTERN.test(id)),
        name: !!source.name && source.name.trim().length > 0,
      },
    }
  }
}
