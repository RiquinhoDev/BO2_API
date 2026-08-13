import logger from '../../utils/logger'
import User from '../../models/user'
import {
  evaluateAchievements,
  type AchievementItem,
  type AchievementStats,
  type UserData,
} from './achievementEvaluator'

const DEFAULT_STALE_MS = 12 * 60 * 60 * 1000

interface PersistOptions {
  force?: boolean
  staleMs?: number
  backfillUnlockedAsSeen?: boolean
}

interface EvaluateAllOptions extends PersistOptions {
  limit?: number
}

type StoredAchievement = Omit<AchievementItem, 'unlockedAt' | 'seenAt'> & {
  unlockedAt: Date | string | null
  seenAt?: Date | string | null
}

type AchievementPersistenceUser = Omit<
  UserData,
  'achievements' | 'achievementStats' | 'inactivation'
> & {
  achievements?: StoredAchievement[]
  achievementStats?: AchievementStats
  inactivation?: UserData['inactivation'] & {
    isManuallyInactivated?: boolean
    reason?: string
  }
  save?: () => Promise<unknown>
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

export function isAchievementsCacheStale(
  user: Pick<AchievementPersistenceUser, 'achievements' | 'achievementStats'>,
  staleMs = DEFAULT_STALE_MS,
): boolean {
  const achievements = Array.isArray(user.achievements) ? user.achievements : []
  if (achievements.length === 0) return true

  const lastEvaluatedAt = toDateOrNull(user.achievementStats?.lastEvaluatedAt)
  if (!lastEvaluatedAt) return true

  return Date.now() - lastEvaluatedAt.getTime() > staleMs
}

function mergeSeenAt(
  evaluatedAchievements: AchievementItem[],
  existingAchievements: StoredAchievement[] | undefined,
  backfillUnlockedAsSeen: boolean
): AchievementItem[] {
  const now = new Date()
  const existingMap = new Map<string, StoredAchievement>()

  for (const achievement of existingAchievements || []) {
    existingMap.set(achievement.id, achievement)
  }

  return evaluatedAchievements.map((achievement) => {
    const existing = existingMap.get(achievement.id)
    const existingUnlockedAt = toDateOrNull(existing?.unlockedAt)
    const existingSeenAt = toDateOrNull(existing?.seenAt)
    const unlockedAt = toDateOrNull(achievement.unlockedAt)

    let seenAt: Date | null = existingSeenAt

    if (unlockedAt && backfillUnlockedAsSeen) {
      const wasAlreadyUnlocked = Boolean(existingUnlockedAt)
      const isFirstEvaluation = !existing
      if (!seenAt && (wasAlreadyUnlocked || isFirstEvaluation)) {
        seenAt = now
      }
    }

    return {
      ...achievement,
      unlockedAt,
      seenAt
    }
  })
}

export async function evaluateAndPersistAchievements(
  user: AchievementPersistenceUser,
  options: PersistOptions = {}
): Promise<{ evaluated: boolean; achievements: AchievementItem[]; stats: AchievementStats }> {
  const shouldEvaluate = options.force || isAchievementsCacheStale(user, options.staleMs)

  if (!shouldEvaluate && user.achievementStats) {
    return {
      evaluated: false,
      achievements: (user.achievements || []).map((achievement) => ({
        ...achievement,
        unlockedAt: toDateOrNull(achievement.unlockedAt),
        seenAt: toDateOrNull(achievement.seenAt),
      })),
      stats: user.achievementStats
    }
  }

  const existingAchievements = Array.isArray(user.achievements) ? user.achievements : []
  const result = await evaluateAchievements({
    ...user,
    achievements: existingAchievements.map((achievement) => ({
      ...achievement,
      unlockedAt: toDateOrNull(achievement.unlockedAt),
      seenAt: toDateOrNull(achievement.seenAt),
    })),
  })
  const achievements = mergeSeenAt(
    result.achievements,
    existingAchievements,
    options.backfillUnlockedAsSeen !== false
  )

  // Actualiza em memória (para quem usa o objecto a seguir, ex: o summary)
  user.achievements = achievements
  user.achievementStats = result.stats

  // Persistir SÓ os campos dos achievements via $set targeted.
  // NÃO usar user.save(): validaria o doc inteiro e rebenta em dados sujos
  // pré-existentes (ex: hotmart.engagement.engagementLevel='MEDIUM' fora do enum)
  // → partia o getStudentOgiSummary p/ ~37% dos alunos. $set não corre validators.
  if (user._id) {
    await User.findByIdAndUpdate(user._id, {
      $set: {
        achievements,
        achievementStats: result.stats
      }
    })
  } else if (typeof user.save === 'function') {
    await user.save()
  }

  return {
    evaluated: true,
    achievements,
    stats: result.stats
  }
}

export async function evaluateAllAchievements(
  options: EvaluateAllOptions = {}
): Promise<{
  total: number
  processed: number
  evaluated: number
  errors: number
  durationMs: number
}> {
  const query = { 'hotmart.purchaseDate': { $exists: true } }
  const users = await User.find(query)
    .select('email name hotmart curseduca discord combined inactivation achievements achievementStats')
    .limit(options.limit || 0)
    .exec()

  let processed = 0
  let evaluated = 0
  let errors = 0
  const startTime = Date.now()

  for (const user of users) {
    try {
      const result = await evaluateAndPersistAchievements(user, {
        force: options.force,
        staleMs: options.staleMs,
        backfillUnlockedAsSeen: options.backfillUnlockedAsSeen !== false
      })
      processed++
      if (result.evaluated) evaluated++
    } catch (error: unknown) {
      errors++
      logger.error(
        `Erro avaliação conquistas ${user.email}:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return {
    total: users.length,
    processed,
    evaluated,
    errors,
    durationMs: Date.now() - startTime
  }
}
