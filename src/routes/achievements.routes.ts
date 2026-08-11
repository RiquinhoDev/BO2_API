import { NextFunction, Router, Request, Response } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import { internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'
import User from '../models/user'
import {
  evaluateAllAchievements,
  evaluateAndPersistAchievements
} from '../services/achievements/achievementEvaluation.service'
import { ACHIEVEMENT_DEFINITIONS, TOTAL_ACHIEVEMENTS } from '../services/achievements/achievementDefinitions'
import {
  isValidSummaryAccessToken,
  normalizeStudentEmail,
  resolveStudentEmailFromToken
} from '../services/studentOgiSummary.service'

const router = Router()

router.get('/definitions', (_req: Request, res: Response) => {
  res.json(successResponse(ACHIEVEMENT_DEFINITIONS, { total: TOTAL_ACHIEVEMENTS }))
})

router.post('/evaluate/:email', asyncRoute(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = (req.params.email as string)?.toLowerCase().trim()
    if (!email) {
      return res.status(400).json({ message: 'Email obrigatório.' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: 'Utilizador não encontrado.' })
    }

    const result = await evaluateAndPersistAchievements(user, {
      force: true,
      backfillUnlockedAsSeen: true
    })

    res.json(successResponse(result.achievements, { message: `Conquistas avaliadas para ${email}`, stats: result.stats }))
  } catch (error: unknown) {
    next(internalError('Erro ao avaliar conquistas', 'ACHIEVEMENTS_EVALUATE_FAILED', error))
  }
}))

router.post('/evaluate-all', asyncRoute(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 0
    const result = await evaluateAllAchievements({
      limit,
      force: true,
      backfillUnlockedAsSeen: true
    })

    res.json(successResponse({
      total: result.total,
      processed: result.processed,
      evaluated: result.evaluated,
      errors: result.errors,
      durationMs: result.durationMs,
      avgPerUser: result.total > 0 ? Math.round(result.durationMs / result.total) : 0,
    }, { message: 'AvaliaÃ§Ã£o de conquistas concluÃ­da' }))
  } catch (error: unknown) {
    next(internalError('Erro na avaliação em massa', 'ACHIEVEMENTS_EVALUATE_ALL_FAILED', error))
  }
}))

router.post('/mark-seen', asyncRoute(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = resolveEmailFromRequest(req)
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids
          .filter((id: unknown) => typeof id === 'string' && id.trim())
          .map((id: string) => id.trim())
      : []

    if (!email) {
      return res.status(400).json({ message: 'Token ou email obrigatório.' })
    }

    if (ids.length === 0) {
      return res.status(400).json({ message: 'Lista de conquistas obrigatória.' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return res.status(404).json({ message: 'Utilizador não encontrado.' })
    }

    const now = new Date()
    let updated = 0
    const idSet = new Set(ids)

    user.achievements = ((user.achievements || []) as any[]).map((achievement: any) => {
      if (idSet.has(achievement.id) && achievement.unlockedAt && !achievement.seenAt) {
        updated++
        return { ...achievement, seenAt: now }
      }
      return achievement
    }) as any

    user.markModified('achievements')
    await user.save()

    res.json(successResponse({ updated }, { message: 'Conquistas marcadas como vistas.' }))
  } catch (error: unknown) {
    next(internalError('Erro ao marcar conquistas como vistas', 'ACHIEVEMENTS_MARK_SEEN_FAILED', error))
  }
}))

router.get('/stats', asyncRoute(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pipeline = [
      { $match: { 'achievementStats.lastEvaluatedAt': { $exists: true } } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          avgUnlocked: { $avg: '$achievementStats.unlocked' },
          avgPercentage: { $avg: '$achievementStats.percentage' },
          avgStreak: { $avg: '$achievementStats.currentStreak' },
          maxStreak: { $max: '$achievementStats.bestStreak' },
        },
      },
    ]

    const [stats] = await User.aggregate(pipeline)
    const achievementCounts: Record<string, number> = {}
    const usersWithAchievements = await User.find(
      { 'achievements.0': { $exists: true } },
      { achievements: 1 }
    ).lean().exec()

    for (const user of usersWithAchievements) {
      for (const achievement of (user as any).achievements || []) {
        if (achievement.unlockedAt) {
          achievementCounts[achievement.id] = (achievementCounts[achievement.id] || 0) + 1
        }
      }
    }

    const sorted = Object.entries(achievementCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([id, count]) => ({ id, count }))

    res.json(successResponse({
      global: stats || { totalUsers: 0 },
      mostCommon: sorted.slice(0, 5),
      leastCommon: sorted.slice(-5).reverse(),
      totalDefinitions: TOTAL_ACHIEVEMENTS,
    }))
  } catch (error: unknown) {
    next(internalError('Erro ao calcular estatísticas', 'ACHIEVEMENTS_STATS_FAILED', error))
  }
}))

function resolveEmailFromRequest(req: Request): string | null {
  if (typeof req.body?.token === 'string' && req.body.token.trim()) {
    return resolveStudentEmailFromToken(req.body.token.trim())
  }

  if (typeof req.query?.token === 'string' && req.query.token.trim()) {
    return resolveStudentEmailFromToken(req.query.token.trim())
  }

  const email = typeof req.body?.email === 'string'
    ? req.body.email
    : typeof req.query?.email === 'string'
      ? req.query.email
      : null
  const summaryToken = req.header('x-student-summary-token')

  if (!email || !isValidSummaryAccessToken(summaryToken)) {
    return null
  }

  return normalizeStudentEmail(email)
}

export default router
