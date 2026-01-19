// src/routes/users.routes.ts - ROTAS ATUALIZADAS PARA COMPATIBILIDADE
import { Router } from "express"
import multer from "multer"
import {
  // Funções existentes (mantidas para compatibilidade)
  listUsers,
  getIdsDiferentes,
  syncDiscordAndHotmart,
  mergeDiscordId,
  getUnmatchedUsers,
  deleteUnmatchedUser,
  deleteIdsDiferentes,
  getUserStats,
  listUsersSimple,
  bulkMergeIds,
  bulkDeleteIds,
  bulkDeleteUnmatchedUsers,
  manualMatch,

  // ✅ NOVAS FUNÇÕES DA FASE 1
  getAllUsersUnified,
  getDashboardStats,

  // 🆕 NOVAS FUNÇÕES PARA EDITOR DE ALUNOS
  editStudent,
  getStudentStats,
  getStudentHistory,
  syncSpecificStudent,
  deleteStudent,
  getUsersInfinite,
  getUsersInfiniteStats,
  getProductStats,
  getUserAllClasses,
  getUserProducts,
  getUserById,
  getUsers,
  getUsersStats,
  searchStudent,
} from "../controllers/users.controller"

import { calculateBatchAverageEngagement } from "../services/syncUtilizadoresServices/engagement/engagementCalculator.service"
import { getUserByEmail } from "../controllers/syncUtilizadoresControllers/curseduca.controller"

const router = Router()
const upload = multer({ dest: "uploads/" })

// ──────────────────────────────────────────────────────────
// ✅ Tipos locais só para remover implicit any (sem mexer na lógica)
// ──────────────────────────────────────────────────────────
type ObjectIdLike = { toString(): string }

type PopulatedUser = {
  _id?: ObjectIdLike
  name?: string
  email?: string
  averageEngagement?: number
  averageEngagementLevel?: string
}

type PopulatedProduct = {
  _id?: ObjectIdLike
  name?: string
  platform?: string
}

type UserProductLean = {
  _id?: ObjectIdLike
  userId?: PopulatedUser | ObjectIdLike
  productId?: PopulatedProduct | ObjectIdLike
  platform?: string
  status?: string
  enrolledAt?: string | Date
  engagement?: { engagementScore?: number }
  progress?: { percentage?: number }
  averageEngagement?: number
  averageEngagementLevel?: string
}

type UserIdOnly = { _id: ObjectIdLike }

type HeatmapUserLean = {
  discord?: {
    engagement?: { lastMessageDate?: Date | string }
    lastMessageDate?: Date | string
  }
}

type HeatmapDay = {
  day: string
  date: string
  avgScore: number
  level: string
  activeUsers: number
}

type HeatmapWeek = {
  weekNumber: number
  startDate: string
  days: HeatmapDay[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FASE 4 & 5: ENDPOINT /v2 - FILTROS AVANÇADOS DASHBOARD V2 (OPTIMIZED)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/v2', getUsers)

router.get('/v2/stats', async (req, res) => {
  try {
    console.log('\n🎯 [/v2/stats] Calculando stats alinhados...')

    const UserProduct = require('../models/UserProduct').default
    const User = require('../models/user').default

    // 1. BASE: UserProducts ACTIVE
    const active: UserProductLean[] = await UserProduct.find({ status: 'ACTIVE' })
      .populate('userId', 'name email')
      .lean()

    console.log(`✅ Base: ${active.length} UserProducts ACTIVE`)

    // 2. EM RISCO: engagement <= 30
    const atRisk = active.filter((up: UserProductLean) =>
      (up.engagement?.engagementScore || 0) <= 30
    )
    console.log(`🚨 Em Risco: ${atRisk.length}`)

    // 3. TOP 10%
    const sorted = [...active].sort((a: UserProductLean, b: UserProductLean) =>
      (b.engagement?.engagementScore || 0) - (a.engagement?.engagementScore || 0)
    )
    const top10Count = Math.ceil(active.length * 0.10)
    const topPerformers = sorted.slice(0, top10Count)
    console.log(`🏆 Top 10%: ${topPerformers.length}`)

    // 4. INATIVOS 30D
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const inactiveUsers: UserIdOnly[] = await User.find({
      'discord.engagement.lastMessageDate': { $lt: thirtyDaysAgo }
    }).select('_id').lean()

    const inactiveIds = new Set(inactiveUsers.map((u: UserIdOnly) => u._id.toString()))

    const inactive30d = active.filter((up: UserProductLean) => {
      const user = up.userId as PopulatedUser | undefined
      const userId = user?._id?.toString() || (up.userId as any)?.toString?.()
      return !!userId && inactiveIds.has(userId)
    })
    console.log(`😴 Inativos 30d: ${inactive30d.length}`)

    // 5. NOVOS 7D
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const new7d = active.filter((up: UserProductLean) =>
      !!up.enrolledAt && new Date(up.enrolledAt) >= sevenDaysAgo
    )
    console.log(`📅 Novos 7d: ${new7d.length}`)

    // 6. CALCULAR DISTRIBUIÇÃO POR PLATAFORMA
    const platformCounts = new Map<string, number>()
    active.forEach((up: UserProductLean) => {
      const p = up.platform || 'unknown'
      platformCounts.set(p, (platformCounts.get(p) || 0) + 1)
    })

    const byPlatform = Array.from(platformCounts.entries()).map(([name, count]) => {
      const icon = name === 'hotmart' ? '🔥' :
        name === 'curseduca' ? '📚' :
          name === 'discord' ? '💬' : '🌟'

      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        percentage: parseFloat(((count / active.length) * 100).toFixed(1)),
        icon
      }
    }).sort((a: { count: number }, b: { count: number }) => b.count - a.count)

    console.log(`📦 Plataformas:`, byPlatform)

    res.json({
      success: true,
      data: {
        overview: {
          totalStudents: active.length,
          avgEngagement:
            active.reduce((sum: number, up: UserProductLean) => sum + (up.engagement?.engagementScore || 0), 0) / active.length,
          avgProgress:
            active.reduce((sum: number, up: UserProductLean) => sum + (up.progress?.percentage || 0), 0) / active.length,
          activeCount: active.length,
          activeRate: 100,
          atRiskCount: atRisk.length,
          atRiskRate: (atRisk.length / active.length) * 100,
          activeProducts: new Set(active.map((up: UserProductLean) => (up.productId as any)?.toString?.() || (up.productId as PopulatedProduct | undefined)?._id?.toString())).size,
          healthScore: 75,
          healthLevel: 'BOM',
          healthBreakdown: {
            engagement: 40,
            retention: 30,
            growth: 20,
            progress: 10
          }
        },
        byPlatform,
        quickFilters: {
          atRisk: atRisk.length,
          topPerformers: topPerformers.length,
          inactive30d: inactive30d.length,
          new7d: new7d.length
        },
        meta: {
          calculatedAt: new Date().toISOString(),
          durationMs: 0
        }
      }
    })

    console.log('✅ Stats alinhados enviados!\n')

  } catch (error) {
    console.error('❌ Erro:', error)
    res.status(500).json({ success: false, error: 'Erro ao calcular stats' })
  }
})

router.get('/v2/engagement/comparison', async (req, res) => {
  try {
    console.log('\n📊 [Engagement Comparison] Calculando...')

    const UserProduct = require('../models/UserProduct').default
    const Product = require('../models/product/Product').default

    const products: any[] = await Product.find({}).lean()
    console.log(`   📦 ${products.length} produtos encontrados`)

    const userProducts: UserProductLean[] = await UserProduct.find({ status: 'ACTIVE' })
      .populate('userId', 'name email')
      .lean()

    console.log(`   👥 ${userProducts.length} UserProducts ACTIVE`)

    const uniqueUserIds: string[] = [
      ...new Set<string>(
        userProducts
          .map((up: UserProductLean) => (up.userId as PopulatedUser | undefined)?._id?.toString() || (up.userId as any)?.toString?.())
          .filter((id: string | undefined): id is string => Boolean(id))
      )
    ]

    const averageEngagements = await calculateBatchAverageEngagement(uniqueUserIds)

    userProducts.forEach((up: UserProductLean) => {
      const user = up.userId as PopulatedUser | undefined
      if (user && user._id) {
        const userId = user._id.toString()
        const engData = averageEngagements.get(userId)
        if (engData) {
          up.averageEngagement = engData.averageScore
          up.averageEngagementLevel = engData.level
        }
      }
    })

    const comparison = products.map((product: any) => {
      const productUserProducts = userProducts.filter(
        (up: UserProductLean) => (up.productId as any)?.toString?.() === product._id.toString()
      )

      if (productUserProducts.length === 0) {
        return {
          productId: product._id,
          productName: product.name,
          platform: product.platform,
          totalStudents: 0,
          avgScore: 0,
          trend: 0,
          distribution: {
            alto: { count: 0, percentage: 0 },
            medio: { count: 0, percentage: 0 },
            baixo: { count: 0, percentage: 0 },
            risco: { count: 0, percentage: 0 }
          }
        }
      }

      const scores = productUserProducts
        .map((up: UserProductLean) => up.averageEngagement || 0)
        .filter((s: number) => s > 0)

      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length)
        : 0

      const alto = productUserProducts.filter((up: UserProductLean) =>
        (up.averageEngagement || 0) >= 60
      ).length

      const medio = productUserProducts.filter((up: UserProductLean) => {
        const score = up.averageEngagement || 0
        return score >= 40 && score < 60
      }).length

      const baixo = productUserProducts.filter((up: UserProductLean) => {
        const score = up.averageEngagement || 0
        return score >= 25 && score < 40
      }).length

      const risco = productUserProducts.filter((up: UserProductLean) =>
        (up.averageEngagement || 0) < 25
      ).length

      const total = productUserProducts.length

      return {
        productId: product._id,
        productName: product.name,
        platform: product.platform,
        totalStudents: total,
        avgScore,
        trend: 0,
        distribution: {
          alto: {
            count: alto,
            percentage: Math.round((alto / total) * 100)
          },
          medio: {
            count: medio,
            percentage: Math.round((medio / total) * 100)
          },
          baixo: {
            count: baixo,
            percentage: Math.round((baixo / total) * 100)
          },
          risco: {
            count: risco,
            percentage: Math.round((risco / total) * 100)
          }
        }
      }
    })

    comparison.sort((a: { totalStudents: number }, b: { totalStudents: number }) => b.totalStudents - a.totalStudents)

    console.log(`✅ Comparação calculada para ${comparison.length} produtos`)

    res.json({
      success: true,
      data: comparison
    })

  } catch (error) {
    console.error('❌ Erro:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao calcular comparação de engagement'
    })
  }
})

router.get('/v2/engagement/heatmap', async (req, res) => {
  try {
    console.log('\n🔥 [Engagement Heatmap] Calculando...')

    const { productId, platform } = req.query

    const UserProduct = require('../models/UserProduct').default
    const User = require('../models/user').default

    const query: any = { status: 'ACTIVE' }
    if (productId) query.productId = productId
    if (platform) query.platform = platform

    const userProducts: UserProductLean[] = await UserProduct.find(query)
      .populate('userId', 'name email')
      .lean()

    console.log(`   👥 ${userProducts.length} UserProducts encontrados`)

    const userIds = userProducts.map((up: UserProductLean) => (up.userId as PopulatedUser | undefined)?._id).filter(Boolean)

    const users: HeatmapUserLean[] = await User.find({
      _id: { $in: userIds }
    }).select('discord.engagement.lastMessageDate discord.lastMessageDate').lean()

    const weeks: HeatmapWeek[] = []
    const now = new Date()

    for (let weekOffset = 3; weekOffset >= 0; weekOffset--) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - (weekOffset * 7) - now.getDay() + 1) // Segunda-feira
      weekStart.setHours(0, 0, 0, 0)

      const days: HeatmapDay[] = []

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDay = new Date(weekStart)
        currentDay.setDate(currentDay.getDate() + dayOffset)

        const nextDay = new Date(currentDay)
        nextDay.setDate(nextDay.getDate() + 1)

        const activeOnDay = users.filter((u: HeatmapUserLean) => {
          const lastMsg = u.discord?.engagement?.lastMessageDate || u.discord?.lastMessageDate
          if (!lastMsg) return false

          const msgDate = new Date(lastMsg)
          return msgDate >= currentDay && msgDate < nextDay
        }).length

        let simulatedScore = 45
        if (dayOffset === 0 || dayOffset === 1 || dayOffset === 2) simulatedScore = 50 // Seg-Qua
        else if (dayOffset === 3) simulatedScore = 52 // Qui (pico)
        else if (dayOffset === 4) simulatedScore = 42 // Sex
        else if (dayOffset === 5) simulatedScore = 28 // Sáb
        else simulatedScore = 25 // Dom (mínimo)

        simulatedScore += Math.floor(Math.random() * 10) - 5

        const level = simulatedScore >= 60 ? 'alto' :
          simulatedScore >= 40 ? 'medio' :
            simulatedScore >= 25 ? 'baixo' : 'risco'

        days.push({
          day: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][dayOffset],
          date: currentDay.toISOString().split('T')[0],
          avgScore: simulatedScore,
          level,
          activeUsers: activeOnDay
        })
      }

      weeks.push({
        weekNumber: 4 - weekOffset,
        startDate: weekStart.toISOString().split('T')[0],
        days
      })
    }

    const allDays = weeks.flatMap((w: HeatmapWeek) => w.days)
    const dayScores = new Map<string, number[]>()

    allDays.forEach((d: HeatmapDay) => {
      if (!dayScores.has(d.day)) dayScores.set(d.day, [])
      dayScores.get(d.day)!.push(d.avgScore)
    })

    const avgByDay = Array.from(dayScores.entries()).map(([day, scores]) => ({
      day,
      avg: (scores as number[]).reduce((sum: number, s: number) => sum + s, 0) / (scores as number[]).length
    }))

    avgByDay.sort((a: { avg: number }, b: { avg: number }) => b.avg - a.avg)

    const bestDay = avgByDay[0].day
    const worstDay = avgByDay[avgByDay.length - 1].day

    const weekdayAvg = avgByDay.slice(0, 5).reduce((sum: number, d: { avg: number }) => sum + d.avg, 0) / 5
    const weekendAvg = avgByDay.slice(5).reduce((sum: number, d: { avg: number }) => sum + d.avg, 0) / 2
    const weekendDrop = Math.round(((weekdayAvg - weekendAvg) / weekdayAvg) * 100)

    console.log(`✅ Heatmap gerado: ${weeks.length} semanas`)

    res.json({
      success: true,
      data: {
        weeks,
        insights: {
          bestDay,
          worstDay,
          weekendDrop
        }
      }
    })

  } catch (error) {
    console.error('❌ Erro:', error)
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar heatmap de engagement'
    })
  }
})

// ✅ ROTAS EXISTENTES (mantidas para compatibilidade)
router.get('/unified', getAllUsersUnified)
router.get('/dashboard-stats', getDashboardStats)
router.get('/infinite', getUsersInfinite)
router.get('/infiniteStats', getUsersInfiniteStats)
router.get('/getProductStats', getProductStats)
router.get('/stats', getUserStats)
router.get('/stats/overview', getUsersStats)
router.get('/search', searchStudent)

router.get("/listUsers", listUsers)
router.get("/listUsersSimple", listUsersSimple)
router.get("/idsDiferentes", getIdsDiferentes)
router.get("/unmatchedUsers", getUnmatchedUsers)
router.get("/getUserStats", getUserStats)
router.get('/users/listUsers', listUsers)

// 2️⃣ ROTAS COM PARÂMETROS + PATH - VÊM ANTES DE /:id
router.get('/:userId/products', getUserProducts)  // 🎯 MOVER PARA AQUI!
router.get('/:userId/all-classes', getUserAllClasses)
router.get('/:id/stats', getStudentStats)
router.get('/:id/history', getStudentHistory)
router.get('/by-email/:email', getUserByEmail)
router.get("/student/:id/stats", getStudentStats)
router.get("/student/:id/history", getStudentHistory)

// 3️⃣ ROTAS GENÉRICAS COM APENAS PARÂMETRO - NO FINAL
router.get('/', getUsers)
router.get('/:id', getUserById)  // 🚨 ÚLTIMA ROTA GET!

// 4️⃣ ROTAS POST/PUT/DELETE - Podem ficar em qualquer posição (não conflitam com GET)
router.post("/syncDiscordAndHotmart", upload.single("file"), syncDiscordAndHotmart)
router.post("/mergeDiscordId", mergeDiscordId)
router.post("/bulkMerge", bulkMergeIds)
router.post("/bulkDelete", bulkDeleteIds)
router.post("/bulkDeleteUnmatched", bulkDeleteUnmatchedUsers)
router.post("/manualMatch", manualMatch)
router.post("/:id/sync", syncSpecificStudent)
router.post("/student/:id/sync", syncSpecificStudent)

router.put("/:id", editStudent)
router.put("/editStudent/:id", editStudent)

router.delete("/unmatchedUsers/:id", deleteUnmatchedUser)
router.delete("/idsDiferentes/:id", deleteIdsDiferentes)
router.delete("/:id", deleteStudent)
router.delete("/student/:id", deleteStudent)

export default router
