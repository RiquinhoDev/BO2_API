import logger from '../../utils/logger'
import User from '../../models/user'
import { HttpError } from '../../security/errorHandling'
import type { CronExecutionPhaseHooks } from '../cron/scheduler/executionPhases'
import { MAX_PROVIDER_READ_ITEMS } from '../../security/providerReadBatchPolicy'
import type { AchievementEvaluationPlan } from '../../types/cron.types'
import {
  evaluateAchievements,
  type AchievementItem,
  type AchievementStats,
  type UserData,
} from './achievementEvaluator'

const DEFAULT_STALE_MS = 12 * 60 * 60 * 1000

export interface AchievementEvaluationOptions {
  force?: boolean
  staleMs?: number
  backfillUnlockedAsSeen?: boolean
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
}

interface EvaluateAllOptions extends AchievementEvaluationOptions {
  limit?: number
}

export class AchievementEvaluationLimitError extends HttpError {
  constructor() {
    super({
      status: 413,
      code: 'ACHIEVEMENT_EVALUATION_LIMIT_EXCEEDED',
      publicMessage: `Avaliação de conquistas limitada a ${MAX_PROVIDER_READ_ITEMS} utilizadores`,
    })
  }
}

class AchievementEvaluationOwnershipError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'AchievementEvaluationOwnershipError'
    this.cause = cause
  }

  readonly cause: unknown
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
  options: AchievementEvaluationOptions = {}
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

  if (options.dryRun === true) {
    return {
      evaluated: true,
      achievements,
      stats: result.stats
    }
  }

  // Persistir SÓ os campos dos achievements via $set targeted.
  // NÃO usar user.save(): validaria o doc inteiro e rebenta em dados sujos
  // pré-existentes (ex: hotmart.engagement.engagementLevel='MEDIUM' fora do enum)
  // → partia o getStudentOgiSummary p/ ~37% dos alunos. $set não corre validators.
  if (user._id) {
    markLocalMutation(options)
    assertOwnership(options)
    await User.findByIdAndUpdate(user._id, {
      $set: {
        achievements,
        achievementStats: result.stats
      }
    })
  } else if (typeof user.save === 'function') {
    markLocalMutation(options)
    assertOwnership(options)
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
  dryRun?: true
  plan?: AchievementEvaluationPlan
}> {
  const query = { 'hotmart.purchaseDate': { $exists: true } }
  const limit = boundedLimit(options.limit)
  const fetchedUsers = await User.find(query)
    .select('email name hotmart curseduca discord combined inactivation achievements achievementStats')
    .sort({ _id: 1 })
    .limit(limit + 1)
    .exec()
  const truncated = fetchedUsers.length > limit
  if (truncated && limit === MAX_PROVIDER_READ_ITEMS && options.dryRun !== true) {
    throw new AchievementEvaluationLimitError()
  }
  const users = fetchedUsers.slice(0, limit)

  let processed = 0
  let evaluated = 0
  let errors = 0
  const startTime = Date.now()

  for (const user of users) {
    assertOwnership(options)
    processed++
    try {
      const result = await evaluateAndPersistAchievements(user, {
        force: options.force,
        staleMs: options.staleMs,
        backfillUnlockedAsSeen: options.backfillUnlockedAsSeen !== false,
        dryRun: options.dryRun,
        phaseHooks: options.phaseHooks,
      })
      if (result.evaluated) evaluated++
    } catch (error: unknown) {
      if (isOwnershipFailure(error)) throw error
      errors++
      logger.error(
        `Erro avaliação conquistas ${user.email}:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const result = {
    total: users.length,
    processed,
    evaluated,
    errors,
    durationMs: Date.now() - startTime
  }
  return options.dryRun === true
    ? {
      ...result,
      dryRun: true,
      plan: {
        operation: 'achievement-evaluation',
        dryRun: true,
        matching: users.length,
        evaluated,
        wouldEvaluate: evaluated,
        limit,
        truncated,
        remaining: truncated ? 1 : 0,
      },
    }
    : result
}

function boundedLimit(requested: number | undefined): number {
  if (requested === undefined || requested === 0 || !Number.isFinite(requested) || requested < 1) {
    return MAX_PROVIDER_READ_ITEMS
  }
  return Math.min(MAX_PROVIDER_READ_ITEMS, Math.floor(requested))
}

function assertOwnership(options: AchievementEvaluationOptions): void {
  try {
    options.phaseHooks?.assertOwnership?.()
  } catch (error: unknown) {
    if (isExternalOwnershipFailure(error)) throw error
    throw new AchievementEvaluationOwnershipError(error)
  }
}

function markLocalMutation(options: AchievementEvaluationOptions): void {
  try {
    options.phaseHooks?.localMutationStarted()
  } catch (error: unknown) {
    if (isExternalOwnershipFailure(error)) throw error
    throw new AchievementEvaluationOwnershipError(error)
  }
}

function isExternalOwnershipFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ActiveCampaignExecutionOwnershipError'
}

function isOwnershipFailure(error: unknown): boolean {
  return error instanceof AchievementEvaluationOwnershipError || isExternalOwnershipFailure(error)
}
