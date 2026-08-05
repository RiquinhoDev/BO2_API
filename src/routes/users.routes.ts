// src/routes/users.routes.ts - ROTAS ATUALIZADAS PARA COMPATIBILIDADE
import { Router } from "express"
import { createUsersImportUpload } from "../security/usersImportUpload"
import { withValidatedInput } from "../security/validatedInput"
import {
  usersBulkDeleteInput,
  usersDeleteByIdInput,
  usersDeleteStudentInput,
} from "../security/usersDestructiveInput"
import {
  usersV2ComparisonInput,
  usersV2StatsInput,
} from "../security/usersV2AnalyticsInput"
import {
  usersV2EnrollmentInput,
  usersV2LegacyInput,
  usersV2OverviewAnalyticsInput,
} from "../security/usersV2ListInput"
import {
  userIdentityBulkMergeInput, userIdentityManualMatchInput, userIdentityMergeInput,
} from "../security/userIdentityInput"
import { usersSimpleListInput } from "../security/usersSimpleListInput"
import { syncDiscordAndHotmart } from "../controllers/userDiscordImport.controller"
import { listUsersSimple } from "../services/users/usersSimpleList.runtime"
import { getStudentStats } from "../services/users/studentStats.runtime"
import { getUsersStatsOverview } from "../services/users/userStatsOverview.runtime"
import { getUserAllClasses } from "../services/users/studentClasses.runtime"
import { getUserById, getUserProducts } from "../services/users/userLookup.runtime"
import { getStudentHistory } from "../services/users/studentHistory.runtime"
import { searchStudent } from "../services/users/studentSearch.runtime"
import { listUsers } from "../services/users/userList.runtime"
import { getAllUsersUnified } from "../services/users/userDirectory.runtime"
import { getUsersInfiniteStats } from "../services/users/userListingStats.runtime"
import { getProductStats } from "../services/users/userProductStats.runtime"
import {
  // Funções existentes (mantidas para compatibilidade)
  getUserStats,
  // ✅ NOVAS FUNÇÕES DA FASE 1
  getDashboardStats,

  // 🆕 NOVAS FUNÇÕES PARA EDITOR DE ALUNOS
  editStudent,
  syncSpecificStudent,
  deleteStudent,
  getUsersInfinite,
} from "../controllers/users.controller"
import {
  bulkDeleteIds, bulkDeleteUnmatchedUsers, bulkMergeIds,
  deleteIdsDiferentes, deleteUnmatchedUser, manualMatch,
  mergeDiscordId,
} from "../controllers/userIdentityReconciliation.controller"
import { getIdsDiferentes, getUnmatchedUsers } from "../controllers/usersReviewLists.controller"

import {
  getUsersV2Comparison,
  getUsersV2Stats,
} from "../services/users/usersV2Analytics.runtime"
import {
  getUsersV2Enrollments,
  getUsersV2Legacy,
  getUsersV2OverviewAnalytics,
} from "../services/users/usersV2List.runtime"
import { getUserByEmail } from "../controllers/syncUtilizadoresControllers/curseduca.controller"

const router = Router()
const usersImportUpload = createUsersImportUpload()

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

type UserProductLean = {
  userId?: PopulatedUser | ObjectIdLike
}

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
router.get(
  '/v2',
  withValidatedInput(usersV2LegacyInput, getUsersV2Legacy),
)

router.get(
  '/v2/enrollments',
  withValidatedInput(usersV2EnrollmentInput, getUsersV2Enrollments),
)

router.get(
  '/v2/analytics',
  withValidatedInput(
    usersV2OverviewAnalyticsInput,
    getUsersV2OverviewAnalytics,
  ),
)

router.get(
  '/v2/stats',
  withValidatedInput(usersV2StatsInput, getUsersV2Stats),
)

router.get(
  '/v2/engagement/comparison',
  withValidatedInput(usersV2ComparisonInput, getUsersV2Comparison),
)

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
router.get('/stats/overview', getUsersStatsOverview)
router.get('/search', searchStudent)

router.get("/listUsers", listUsers)
router.get("/listUsersSimple", withValidatedInput(usersSimpleListInput, listUsersSimple))
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
router.get(
  '/',
  withValidatedInput(usersV2LegacyInput, getUsersV2Legacy),
)
router.get('/:id', getUserById)  // 🚨 ÚLTIMA ROTA GET!

// 4️⃣ ROTAS POST/PUT/DELETE - Podem ficar em qualquer posição (não conflitam com GET)
router.post("/syncDiscordAndHotmart", usersImportUpload, syncDiscordAndHotmart)
router.post("/mergeDiscordId", withValidatedInput(userIdentityMergeInput, mergeDiscordId))
router.post("/bulkMerge", withValidatedInput(userIdentityBulkMergeInput, bulkMergeIds))
router.post(
  "/bulkDelete",
  withValidatedInput(
    usersBulkDeleteInput, bulkDeleteIds,
  )
)
router.post(
  "/bulkDeleteUnmatched",
  withValidatedInput(
    usersBulkDeleteInput, bulkDeleteUnmatchedUsers,
  )
)
router.post("/manualMatch", withValidatedInput(userIdentityManualMatchInput, manualMatch))
router.post("/:id/sync", syncSpecificStudent)
router.post("/student/:id/sync", syncSpecificStudent)

router.put("/:id", editStudent)
router.put("/editStudent/:id", editStudent)

router.delete(
  "/unmatchedUsers/:id",
  withValidatedInput(
    usersDeleteByIdInput, deleteUnmatchedUser,
  )
)
router.delete(
  "/idsDiferentes/:id",
  withValidatedInput(
    usersDeleteByIdInput, deleteIdsDiferentes,
  )
)
router.delete(
  "/:id",
  withValidatedInput(usersDeleteStudentInput, (input, _req, res) =>
    deleteStudent(input, res)
  )
)
router.delete(
  "/student/:id",
  withValidatedInput(usersDeleteStudentInput, (input, _req, res) =>
    deleteStudent(input, res)
  )
)

export default router
