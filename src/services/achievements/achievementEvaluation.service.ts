import User from '../../models/user'
import { evaluateAchievements } from './achievementEvaluator'

const DEFAULT_STALE_MS = 12 * 60 * 60 * 1000

interface PersistOptions {
  force?: boolean
  staleMs?: number
  backfillUnlockedAsSeen?: boolean
}

interface EvaluateAllOptions extends PersistOptions {
  limit?: number
}

interface AchievementWithSeen {
  id: string
  unlockedAt: Date | string | null
  seenAt?: Date | string | null
  progress?: {
    current: number
    target: number
  }
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

export function isAchievementsCacheStale(user: any, staleMs = DEFAULT_STALE_MS): boolean {
  const achievements = Array.isArray(user?.achievements) ? user.achievements : []
  if (achievements.length === 0) return true

  const lastEvaluatedAt = toDateOrNull(user?.achievementStats?.lastEvaluatedAt)
  if (!lastEvaluatedAt) return true

  return Date.now() - lastEvaluatedAt.getTime() > staleMs
}

function mergeSeenAt(
  evaluatedAchievements: AchievementWithSeen[],
  existingAchievements: AchievementWithSeen[] | undefined,
  backfillUnlockedAsSeen: boolean
): AchievementWithSeen[] {
  const now = new Date()
  const existingMap = new Map<string, AchievementWithSeen>()

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
  user: any,
  options: PersistOptions = {}
): Promise<{ evaluated: boolean; achievements: AchievementWithSeen[]; stats: any }> {
  const shouldEvaluate = options.force || isAchievementsCacheStale(user, options.staleMs)

  if (!shouldEvaluate) {
    return {
      evaluated: false,
      achievements: user.achievements || [],
      stats: user.achievementStats
    }
  }

  const existingAchievements = Array.isArray(user.achievements) ? user.achievements : []
  const result = await evaluateAchievements(typeof user.toObject === 'function' ? user.toObject() : user)
  const achievements = mergeSeenAt(
    result.achievements as AchievementWithSeen[],
    existingAchievements,
    options.backfillUnlockedAsSeen !== false
  )

  user.achievements = achievements as any
  user.achievementStats = result.stats as any

  if (typeof user.markModified === 'function') {
    user.markModified('achievements')
    user.markModified('achievementStats')
  }

  if (typeof user.save === 'function') {
    await user.save()
  } else if (user._id) {
    await User.findByIdAndUpdate(user._id, {
      $set: {
        achievements,
        achievementStats: result.stats
      }
    })
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
  const query: any = { 'hotmart.purchaseDate': { $exists: true } }
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
    } catch (error: any) {
      errors++
      console.error(`Erro avaliação conquistas ${user.email}:`, error.message)
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
