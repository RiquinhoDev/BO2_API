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
  searchStudent,
  editStudent,
  getStudentStats,
  getStudentHistory,
  syncSpecificStudent,
  deleteStudent,
  getUsersInfinite,
  getUsersInfiniteStats,
  getProductStats,
  getUserAllClasses,
} from "../controllers/users.controller"

// 🎯 FASE 4 & 5: Import do serviço unificado
import { getAllUsersUnified as getAllUsersUnifiedService } from "../services/dualReadService"

const router = Router()
const upload = multer({ dest: "uploads/" })

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FASE 4 & 5: ENDPOINT /v2 - FILTROS AVANÇADOS DASHBOARD V2
// ═══════════════════════════════════════════════════════════════════════════
/**
 * GET /api/users/v2
 * 
 * Endpoint para listar UserProducts com filtros avançados
 * 
 * Query Params:
 * - search: Email ou nome (string)
 * - platform: hotmart | curseduca | discord
 * - productId: ID do produto
 * - status: ACTIVE | INACTIVE
 * - progressLevel: MUITO_BAIXO | BAIXO | MEDIO | ALTO | MUITO_ALTO
 * - engagementLevel: MUITO_BAIXO | BAIXO | MEDIO | ALTO | MUITO_ALTO (pode ser CSV)
 * - enrolledAfter: Data ISO (ex: 2025-11-20T17:14:50.954Z)
 * - page: Número da página (default: 1)
 * - limit: Resultados por página (default: 50, max: 100)
 */
router.get('/v2', async (req, res) => {
  try {
    console.log('\n═══════════════════════════════════════════════')
    console.log('🔍 [API /users/v2] Query params recebidos:')
    console.log(req.query)  // ← ESTE LOG É CRUCIAL!
    console.log('═══════════════════════════════════════════════\n')
    
  const {
    search,
    platform,
    productId,
    status,
    progressLevel,
    engagementLevel,
    enrolledAfter,
    maxEngagement,
    lastAccessBefore,  
    topPercentage,     
    page = '1',
    limit = '50'
  } = req.query
    
// ──────────────────────────────────────────────────────────
// 1. BUSCAR TODOS OS USERPRODUCTS (QUERY DIRETA - RÁPIDA!)
// ──────────────────────────────────────────────────────────
console.log('🚀 [API /users/v2] Usando query DIRETA (otimizada para pesquisas)')
const startFetch = Date.now()

const UserProduct = require('../models/UserProduct').default

const unifiedUserProducts = await UserProduct.find({})
  .populate('userId', 'name email')
  .populate('productId', 'name platform')
  .lean()
  .maxTimeMS(10000) // Timeout 10s

const fetchDuration = Date.now() - startFetch
console.log(`✅ [API /users/v2] ${unifiedUserProducts.length} UserProducts em ${fetchDuration}ms`)
    // ──────────────────────────────────────────────────────────
    // 2. APLICAR FILTROS
    // ──────────────────────────────────────────────────────────
    let filtered = [...unifiedUserProducts]
    
    // Filtro: Email/Nome
if (search && typeof search === 'string') {
  const searchLower = search.toLowerCase()
  filtered = filtered.filter((up: any) => {
    // ✅ CORREÇÃO: Acessar objetos populados corretamente
    const userName = (up.userId?.name || '').toLowerCase()
    const userEmail = (up.userId?.email || '').toLowerCase()
    const match = userName.includes(searchLower) || userEmail.includes(searchLower)
    
    // 🐛 DEBUG TEMPORÁRIO
    if (userEmail.includes('joaomcf37')) {
      console.log('🐛 [DEBUG] Encontrado:', {
        email: up.userId?.email,
        name: up.userId?.name,
        match,
        searchLower
      })
    }
    
    return match
  })
  console.log(`🔍 [Filtro Search] "${search}": ${filtered.length} resultados`)
}
    
    // Filtro: Plataforma
    if (platform && platform !== 'todas' && typeof platform === 'string') {
      filtered = filtered.filter((up: any) => 
        up.platform?.toLowerCase() === platform.toLowerCase()
      )
      console.log(`🔍 [Filtro Platform] "${platform}": ${filtered.length} resultados`)
    }
    
    // Filtro: Produto
    if (productId && productId !== 'todos' && typeof productId === 'string') {
      filtered = filtered.filter((up: any) => {
        const prodId = up.productId?._id?.toString() || up.productId?.toString()
        return prodId === productId
      })
      console.log(`🔍 [Filtro ProductId] "${productId}": ${filtered.length} resultados`)
    }
    
    // Filtro: Status
    if (status && status !== 'todos' && typeof status === 'string') {
      filtered = filtered.filter((up: any) => 
        up.status?.toUpperCase() === status.toUpperCase()
      )
      console.log(`🔍 [Filtro Status] "${status}": ${filtered.length} resultados`)
    }
    
    // Filtro: Progresso
    if (progressLevel && typeof progressLevel === 'string') {
      const ranges: Record<string, { min: number; max: number }> = {
        'MUITO_BAIXO': { min: 0, max: 25 },
        'BAIXO': { min: 25, max: 40 },
        'MEDIO': { min: 40, max: 60 },
        'ALTO': { min: 60, max: 80 },
        'MUITO_ALTO': { min: 80, max: 100 }
      }
      
      const range = ranges[progressLevel.toUpperCase()]
      if (range) {
        filtered = filtered.filter((up: any) => {
          const progress = up.progress?.percentage || 0
          return progress >= range.min && progress < range.max
        })
        console.log(`🔍 [Filtro Progress] "${progressLevel}": ${filtered.length} resultados`)
      }
    }
    
    // Filtro: Engagement (suporta CSV: "MUITO_BAIXO,BAIXO")
    if (engagementLevel && typeof engagementLevel === 'string') {
      const levels = engagementLevel.split(',').map(l => l.trim().toUpperCase())
      filtered = filtered.filter((up: any) => {
        const level = (up.engagement?.engagementLevel || '').toUpperCase()
        return levels.includes(level)
      })
      console.log(`🔍 [Filtro Engagement] "${engagementLevel}": ${filtered.length} resultados`)
    }
    
    // Filtro: Data de Inscrição (enrolledAfter)
    if (enrolledAfter && typeof enrolledAfter === 'string') {
      const afterDate = new Date(enrolledAfter)
      filtered = filtered.filter((up: any) => {
        if (!up.enrolledAt) return false
        const enrolledDate = new Date(up.enrolledAt)
        return enrolledDate >= afterDate
      })
      console.log(`🔍 [Filtro EnrolledAfter] "${enrolledAfter}": ${filtered.length} resultados`)

        // 👇 NOVO: contar alunos únicos
  const uniqueUserIds = new Set(
    filtered.map((up: any) => up.userId?._id?.toString() || up.userId?.toString())
  )
  console.log(`👤 [Novos 7d] Alunos únicos neste filtro: ${uniqueUserIds.size}`)
    }

    if (maxEngagement && typeof maxEngagement === 'string') {
  const maxScore = parseInt(maxEngagement)
  
  if (!isNaN(maxScore)) {
    filtered = filtered.filter((up: any) => {
      const score = up.engagement?.engagementScore || 0
      return score <= maxScore
    })
    
    console.log(`🚨 [Filtro MaxEngagement] <= ${maxScore}: ${filtered.length} resultados`)
  }
}
    // Filtro: Última atividade ANTES de uma data (inativos 30d)
if (lastAccessBefore && typeof lastAccessBefore === 'string') {
  const beforeDate = new Date(lastAccessBefore)
  
  const User = require('../models/user').default
  const usersWithDiscord = await User.find({
    'discord.engagement.lastMessageDate': { $lt: beforeDate }
  }).select('_id').lean()
  
  const inactiveUserIds = usersWithDiscord.map(u => u._id.toString())
  
  filtered = filtered.filter((up: any) => {
    const userId = up.userId?._id?.toString() || up.userId?.toString()
    return inactiveUserIds.includes(userId)
  })
}

    // ──────────────────────────────────────────────────────────
    // 3. ORDENAÇÃO (opcional - por engagement decrescente)
    // ──────────────────────────────────────────────────────────

if (topPercentage && typeof topPercentage === 'string') {
  const percentage = parseInt(topPercentage)
  
  if (percentage > 0 && percentage <= 100) {
    const withScores = filtered.map((up: any) => ({
      ...up,
      _calculatedScore: up.engagement?.engagementScore || 0
    }))
    
    withScores.sort((a, b) => b._calculatedScore - a._calculatedScore)
    
    const topCount = Math.ceil(withScores.length * (percentage / 100))
    filtered = withScores.slice(0, topCount)
  }
}
    filtered.sort((a: any, b: any) => {
      const engA = a.engagement?.engagementScore || 0
      const engB = b.engagement?.engagementScore || 0
      return engB - engA // Maior engagement primeiro
    })
    
    // ──────────────────────────────────────────────────────────
    // 4. PAGINAÇÃO
    // ──────────────────────────────────────────────────────────
    const pageNum = parseInt(page as string) || 1
    const limitNum = Math.min(parseInt(limit as string) || 50, 100)
    
    const total = filtered.length
    const totalPages = Math.ceil(total / limitNum)
    const startIndex = (pageNum - 1) * limitNum
    const endIndex = startIndex + limitNum
    
    const paginatedResults = filtered.slice(startIndex, endIndex)
    
    console.log(`📄 [Paginação] Página ${pageNum}/${totalPages} (${paginatedResults.length} de ${total} resultados)`)
    
    // ──────────────────────────────────────────────────────────
    // 5. RESPOSTA (formato compatível com frontend)
    // ──────────────────────────────────────────────────────────
    res.json({
      success: true,
      data: paginatedResults,
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
        hasMore: endIndex < total,
        showing: paginatedResults.length
      }
    })
    
    console.log(`✅ [API /users/v2] Resposta enviada com sucesso\n`)
    
  } catch (error) {
    console.error('❌ [API /users/v2] Erro ao filtrar users:', error)
    res.status(500).json({ 
      success: false,
      error: 'Erro ao filtrar users',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
})

// ✅ ROTAS EXISTENTES (mantidas para compatibilidade)
router.get("/listUsers", listUsers)
router.get("/idsDiferentes", getIdsDiferentes)
router.post("/syncDiscordAndHotmart", upload.single("file"), syncDiscordAndHotmart)
router.post("/mergeDiscordId", mergeDiscordId)
router.get("/unmatchedUsers", getUnmatchedUsers)
router.delete("/unmatchedUsers/:id", deleteUnmatchedUser)
router.delete("/idsDiferentes/:id", deleteIdsDiferentes)
router.get("/getUserStats", getUserStats)
// Alias para compatibilidade com o frontend novo
router.get('/stats', getUserStats)
router.get("/listUsersSimple", listUsersSimple)

router.get('/v2/stats', async (req, res) => {
  try {
    console.log('\n📊 ========================================')
    console.log('📊 [API /users/v2/stats] Calculando stats...')
    console.log('📊 ========================================\n')
    
    const UserProduct = require('../models/UserProduct').default
    const startTime = Date.now()
    
    // 1. Buscar TODOS os UserProducts ACTIVE (base comum para todos os filtros)
    console.log('🔍 Buscando UserProducts ACTIVE...')
    const activeUserProducts = await UserProduct.find({ status: 'ACTIVE' })
      .populate('userId', 'name email')
      .lean()
      .maxTimeMS(10000)
    
    console.log(`   ✅ ${activeUserProducts.length} UserProducts ACTIVE encontrados`)
    
    // 2. Calcular cada filtro rápido
    const now = new Date()
    
    // ═══════════════════════════════════════════════════════════════════
    // 🚨 EM RISCO: score <= 30
    // ═══════════════════════════════════════════════════════════════════
    console.log('🚨 Calculando "Em Risco"...')
    const atRisk = activeUserProducts.filter(up => {
      const score = up.engagement?.engagementScore || 0
      return score <= 30
    })
    
    const atRiskUserIds = new Set(
      atRisk.map(up => up.userId?._id?.toString() || up.userId?.toString())
    )
    
    console.log(`   ✅ Em Risco: ${atRisk.length} UserProducts (${atRiskUserIds.size} alunos únicos)`)
    
    // ═══════════════════════════════════════════════════════════════════
    // 🏆 TOP 10%: calcular threshold dinâmico
    // ═══════════════════════════════════════════════════════════════════
    console.log('🏆 Calculando "Top 10%"...')
    const withScores = activeUserProducts.map(up => ({
      ...up,
      score: up.engagement?.engagementScore || 0
    })).sort((a, b) => b.score - a.score)
    
    const top10Count = Math.ceil(withScores.length * 0.10)
    const topPerformers = withScores.slice(0, top10Count)
    const topPerformersUserIds = new Set(
      topPerformers.map(up => up.userId?._id?.toString() || up.userId?.toString())
    )
    const top10Threshold = topPerformers[topPerformers.length - 1]?.score || 0
    
    console.log(`   ✅ Top 10%: ${topPerformers.length} UserProducts (${topPerformersUserIds.size} alunos únicos, threshold: ${top10Threshold.toFixed(1)})`)
    
    // ═══════════════════════════════════════════════════════════════════
    // 😴 INATIVOS 30D: sem mensagens no Discord há 30 dias
    // ═══════════════════════════════════════════════════════════════════
    console.log('😴 Calculando "Inativos 30d"...')
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(now.getDate() - 30)
    
    const User = require('../models/user').default
    const inactiveUsers = await User.find({
      'discord.engagement.lastMessageDate': { $lt: thirtyDaysAgo }
    }).select('_id').lean()
    
    const inactiveUserIds = new Set(
      inactiveUsers.map(u => u._id.toString())
    )
    
    const inactive30d = activeUserProducts.filter(up => {
      const userId = up.userId?._id?.toString() || up.userId?.toString()
      return inactiveUserIds.has(userId)
    })
    
    const inactive30dUserIds = new Set(
      inactive30d.map(up => up.userId?._id?.toString() || up.userId?.toString())
    )
    
    console.log(`   ✅ Inativos 30d: ${inactive30d.length} UserProducts (${inactive30dUserIds.size} alunos únicos)`)
    
    // ═══════════════════════════════════════════════════════════════════
    // 📅 NOVOS 7D: inscritos nos últimos 7 dias
    // ═══════════════════════════════════════════════════════════════════
    console.log('📅 Calculando "Novos 7d"...')
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(now.getDate() - 7)
    
    const new7d = activeUserProducts.filter(up => {
      if (!up.enrolledAt) return false
      const enrolledDate = new Date(up.enrolledAt)
      return enrolledDate >= sevenDaysAgo
    })
    
    const new7dUserIds = new Set(
      new7d.map(up => up.userId?._id?.toString() || up.userId?.toString())
    )
    
    console.log(`   ✅ Novos 7d: ${new7d.length} UserProducts (${new7dUserIds.size} alunos únicos)`)
    
    // 3. Calcular métricas gerais
    const totalUniqueStudents = new Set(
      activeUserProducts.map(up => up.userId?._id?.toString() || up.userId?.toString())
    ).size
    
    const avgEngagement = activeUserProducts.length > 0
      ? Math.round(
          activeUserProducts.reduce((sum, up) => sum + (up.engagement?.engagementScore || 0), 0) / 
          activeUserProducts.length
        )
      : 0
    
    const avgProgress = activeUserProducts.length > 0
      ? Math.round(
          activeUserProducts.reduce((sum, up) => sum + (up.progress?.percentage || 0), 0) / 
          activeUserProducts.length
        )
      : 0
    
    // 4. Construir resposta
    const duration = Date.now() - startTime
    
    const stats = {
      overview: {
        totalUserProducts: activeUserProducts.length,
        totalUniqueStudents,
        avgEngagement,
        avgProgress
      },
      quickFilters: {
        atRisk: {
          count: atRisk.length,
          uniqueUsers: atRiskUserIds.size,
          percentage: Math.round((atRisk.length / activeUserProducts.length) * 100),
          criteria: 'score <= 30'
        },
        topPerformers: {
          count: topPerformers.length,
          uniqueUsers: topPerformersUserIds.size,
          threshold: parseFloat(top10Threshold.toFixed(1)),
          criteria: 'top 10% by score'
        },
        inactive30d: {
          count: inactive30d.length,
          uniqueUsers: inactive30dUserIds.size,
          percentage: Math.round((inactive30d.length / activeUserProducts.length) * 100),
          criteria: 'no Discord activity in 30 days'
        },
        new7d: {
          count: new7d.length,
          uniqueUsers: new7dUserIds.size,
          percentage: Math.round((new7d.length / activeUserProducts.length) * 100),
          criteria: 'enrolled in last 7 days'
        }
      },
      meta: {
        calculatedAt: new Date(),
        duration,
        dataSource: 'UserProducts ACTIVE (real-time)',
        version: 'v2-unified'
      }
    }
    
    console.log('\n✅ ========================================')
    console.log(`✅ Stats calculados em ${duration}ms`)
    console.log('✅ Quick Filters:')
    console.log(`   🚨 Em Risco: ${stats.quickFilters.atRisk.count} (${stats.quickFilters.atRisk.uniqueUsers} alunos)`)
    console.log(`   🏆 Top 10%: ${stats.quickFilters.topPerformers.count} (${stats.quickFilters.topPerformers.uniqueUsers} alunos, threshold: ${stats.quickFilters.topPerformers.threshold})`)
    console.log(`   😴 Inativos 30d: ${stats.quickFilters.inactive30d.count} (${stats.quickFilters.inactive30d.uniqueUsers} alunos)`)
    console.log(`   📅 Novos 7d: ${stats.quickFilters.new7d.count} (${stats.quickFilters.new7d.uniqueUsers} alunos)`)
    console.log('✅ ========================================\n')
    
    res.json({
      success: true,
      data: stats
    })
    
  } catch (error) {
    console.error('\n❌ ========================================')
    console.error('❌ [API /users/v2/stats] Erro:', error)
    console.error('❌ ========================================\n')
    
    res.status(500).json({
      success: false,
      error: 'Erro ao calcular stats',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
})
// ✅ ADICIONAR: Nova rota para listar todos os users unificados
router.get('/unified', getAllUsersUnified)

// ✅ ADICIONAR: Nova rota para dashboard stats com Curseduca
router.get('/dashboard-stats', getDashboardStats)

// 🔄 AÇÕES EM LOTE
router.post("/bulkMerge", bulkMergeIds)
router.post("/bulkDelete", bulkDeleteIds)
router.post("/bulkDeleteUnmatched", bulkDeleteUnmatchedUsers)
router.post("/manualMatch", manualMatch)

// 🎓 ROTAS ESPECÍFICAS PARA EDITOR DE ALUNOS E COMPATIBILIDADE COM FRONTEND

// 🔍 Pesquisar alunos - Compatível com ambos os formatos
router.get("/search", searchStudent) // Rota nova padrão
router.get("/searchStudent", searchStudent) // Compatibilidade com API antiga

// ✏️ Editar aluno - Compatível com ambos os formatos
router.put("/:id", editStudent) // Rota nova padrão RESTful
router.put("/editStudent/:id", editStudent) // Compatibilidade com API antiga

// 📊 Estatísticas detalhadas do aluno
router.get("/:id/stats", getStudentStats)
router.get("/student/:id/stats", getStudentStats) // Alias alternativo

// 📋 Histórico de alterações do aluno
router.get("/:id/history", getStudentHistory)
router.get("/student/:id/history", getStudentHistory) // Alias alternativo

// 🔄 Sincronizar aluno específico com Hotmart
router.post("/:id/sync", syncSpecificStudent)
router.post("/student/:id/sync", syncSpecificStudent) // Alias alternativo

// 🗑️ Eliminar aluno
router.delete("/:id", deleteStudent)
router.delete("/student/:id", deleteStudent) // Alias alternativo


router.get('/infinite', getUsersInfinite)
router.get('/infiniteStats', getUsersInfiniteStats)
router.get('/getProductStats', getProductStats)

// 🆕 ROTA: Obter todas as turmas de um utilizador (Hotmart + Curseduca)
router.get('/:userId/all-classes', getUserAllClasses)

router.get('/users/listUsers', listUsers)
export default router