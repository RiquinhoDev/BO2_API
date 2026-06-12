import { Router, Request, Response } from 'express'
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
  res.json({
    total: TOTAL_ACHIEVEMENTS,
    definitions: ACHIEVEMENT_DEFINITIONS,
  })
})

router.post('/evaluate/:email', async (req: Request, res: Response) => {
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

    res.json({
      message: `Conquistas avaliadas para ${email}`,
      stats: result.stats,
      achievements: result.achievements,
    })
  } catch (error: any) {
    console.error('Erro ao avaliar conquistas:', error.message)
    res.status(500).json({ message: 'Erro ao avaliar conquistas', details: error.message })
  }
})

router.post('/evaluate-all', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 0
    const result = await evaluateAllAchievements({
      limit,
      force: true,
      backfillUnlockedAsSeen: true
    })

    res.json({
      message: 'Avaliação de conquistas concluída',
      total: result.total,
      processed: result.processed,
      evaluated: result.evaluated,
      errors: result.errors,
      durationMs: result.durationMs,
      avgPerUser: result.total > 0 ? Math.round(result.durationMs / result.total) : 0,
    })
  } catch (error: any) {
    console.error('Erro na avaliação em massa:', error.message)
    res.status(500).json({ message: 'Erro na avaliação em massa', details: error.message })
  }
})

router.post('/mark-seen', async (req: Request, res: Response) => {
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

    res.json({
      message: 'Conquistas marcadas como vistas.',
      updated
    })
  } catch (error: any) {
    console.error('Erro ao marcar conquistas como vistas:', error.message)
    res.status(500).json({ message: 'Erro ao marcar conquistas como vistas', details: error.message })
  }
})

router.get('/stats', async (_req: Request, res: Response) => {
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

    res.json({
      global: stats || { totalUsers: 0 },
      mostCommon: sorted.slice(0, 5),
      leastCommon: sorted.slice(-5).reverse(),
      totalDefinitions: TOTAL_ACHIEVEMENTS,
    })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao calcular estatísticas', details: error.message })
  }
})

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
