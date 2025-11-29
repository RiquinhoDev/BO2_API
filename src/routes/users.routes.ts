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
    console.log('🔍 [API /users/v2] Recebendo requisição:', req.query)
    
  const {
    search,
    platform,
    productId,
    status,
    progressLevel,
    engagementLevel,
    enrolledAfter,
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
      const searchLower = search.toLowerCase().trim()
      filtered = filtered.filter((up: any) => {
        const email = up.userId?.email?.toLowerCase() || ''
        const name = up.userId?.name?.toLowerCase() || ''
        return email.includes(searchLower) || name.includes(searchLower)
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
    }
    // Filtro: Última atividade ANTES de uma data (inativos 30d)
    if (lastAccessBefore && typeof lastAccessBefore === 'string') {
      const beforeDate = new Date(lastAccessBefore)
      filtered = filtered.filter((up: any) => {
        // Se não tem lastAccessDate, considerar inativo
        if (!up.lastAccessDate) return true
        const lastAccess = new Date(up.lastAccessDate)
        return lastAccess < beforeDate
      })
      console.log(`🔍 [Filtro LastAccessBefore] "${lastAccessBefore}": ${filtered.length} resultados`)
    }
    // ──────────────────────────────────────────────────────────
    // 3. ORDENAÇÃO (opcional - por engagement decrescente)
    // ──────────────────────────────────────────────────────────

    if (topPercentage && typeof topPercentage === 'string') {
  const percentage = parseInt(topPercentage)
  if (percentage > 0 && percentage <= 100) {
    // 1. Ordenar por engagement (maior primeiro)
    filtered.sort((a: any, b: any) => {
      const engA = a.engagement?.engagementScore || 0
      const engB = b.engagement?.engagementScore || 0
      return engB - engA
    })
    
    // 2. Pegar só os top X%
    const topCount = Math.ceil(filtered.length * (percentage / 100))
    filtered = filtered.slice(0, topCount)
    
    console.log(`🏆 [Filtro TopPercentage] Top ${percentage}%: ${filtered.length}/${unifiedUserProducts.length} alunos`)
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