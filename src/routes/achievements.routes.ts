// ════════════════════════════════════════════════════════════
// 📁 src/routes/achievements.routes.ts
// Rotas para gestão de conquistas
// ════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express'
import User from '../models/user'
import { evaluateAchievements } from '../services/achievements/achievementEvaluator'
import { ACHIEVEMENT_DEFINITIONS, TOTAL_ACHIEVEMENTS } from '../services/achievements/achievementDefinitions'

const router = Router()

// ─────────────────────────────────────────────────────────────
// GET /api/achievements/definitions
// Lista todas as definições de conquistas
// ─────────────────────────────────────────────────────────────
router.get('/definitions', (_req: Request, res: Response) => {
  res.json({
    total: TOTAL_ACHIEVEMENTS,
    definitions: ACHIEVEMENT_DEFINITIONS,
  })
})

// ─────────────────────────────────────────────────────────────
// POST /api/achievements/evaluate/:email
// Avalia conquistas para um utilizador específico (admin/debug)
// ─────────────────────────────────────────────────────────────
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

    const result = await evaluateAchievements(user.toObject())

    // Guardar no documento do utilizador
    user.achievements = result.achievements as any
    user.achievementStats = result.stats as any
    await user.save()

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

// ─────────────────────────────────────────────────────────────
// POST /api/achievements/evaluate-all
// Avalia conquistas para TODOS os utilizadores (batch/sync)
// ─────────────────────────────────────────────────────────────
router.post('/evaluate-all', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 0  // 0 = todos
    const query: any = { 'hotmart.purchaseDate': { $exists: true } }  // Só users com Hotmart

    const users = await User.find(query)
      .select('email name hotmart curseduca discord combined inactivation achievements achievementStats')
      .limit(limit || 0)
      .exec()

    let processed = 0
    let errors = 0
    const startTime = Date.now()

    for (const user of users) {
      try {
        const result = await evaluateAchievements(user.toObject())
        user.achievements = result.achievements as any
        user.achievementStats = result.stats as any
        await user.save()
        processed++
      } catch (err: any) {
        errors++
        console.error(`Erro avaliação conquistas ${user.email}:`, err.message)
      }
    }

    const duration = Date.now() - startTime

    res.json({
      message: 'Avaliação de conquistas concluída',
      total: users.length,
      processed,
      errors,
      durationMs: duration,
      avgPerUser: users.length > 0 ? Math.round(duration / users.length) : 0,
    })
  } catch (error: any) {
    console.error('Erro na avaliação em massa:', error.message)
    res.status(500).json({ message: 'Erro na avaliação em massa', details: error.message })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/achievements/stats
// Estatísticas globais de conquistas
// ─────────────────────────────────────────────────────────────
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

    // Conquistas mais e menos comuns
    const achievementCounts: Record<string, number> = {}
    const usersWithAchievements = await User.find(
      { 'achievements.0': { $exists: true } },
      { achievements: 1 }
    ).lean().exec()

    for (const u of usersWithAchievements) {
      for (const a of (u as any).achievements || []) {
        if (a.unlockedAt) {
          achievementCounts[a.id] = (achievementCounts[a.id] || 0) + 1
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

export default router
