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

// 🎯 FASE 4 & 5: Import do serviço unificado
import { getAllUsersUnified as getAllUsersUnifiedService } from "../services/dualReadService"
import { calculateBatchAverageEngagement } from "../services/engagementCalculator.service"

import { getUserByEmail } from "../controllers/syncUtilizadoresControllers.ts/curseduca.controller"


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
// 1.5. CALCULAR ENGAGEMENT MÉDIO PARA TODOS OS USERS
// ──────────────────────────────────────────────────────────
console.log('🧮 [API /users/v2] Calculando engagement médio...')
const engagementStart = Date.now()

// Obter IDs únicos de users
const uniqueUserIds: string[] = [...new Set<string>(
  unifiedUserProducts
    .map((up: any) => up.userId?._id?.toString() || up.userId?.toString())
    .filter((id): id is string => Boolean(id))  // type guard
)];


console.log(`   📊 ${uniqueUserIds.length} users únicos encontrados`)

// Calcular engagement médio em batch (performance!)
const averageEngagements = await calculateBatchAverageEngagement(uniqueUserIds)

// Enriquecer cada UserProduct com engagement médio do user
unifiedUserProducts.forEach((up: any) => {
  if (up.userId && up.userId._id) {
    const userId = up.userId._id.toString()
    const engagementData = averageEngagements.get(userId)
    
    if (engagementData) {
      // Adicionar ao objeto userId (para frontend acessar)
      up.userId.averageEngagement = engagementData.averageScore
      up.userId.averageEngagementLevel = engagementData.level
      
      // Também adicionar direto no UserProduct (backup)
      up.averageEngagement = engagementData.averageScore
      up.averageEngagementLevel = engagementData.level
    }
  }
})

const engagementDuration = Date.now() - engagementStart
console.log(`✅ [API /users/v2] Engagement calculado em ${engagementDuration}ms`)

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
// Filtro: Engagement Level (USAR MÉDIA!)
  if (engagementLevel && engagementLevel !== 'todos') {
    const levels = (engagementLevel as string).split(',').map(l => l.trim().toUpperCase())
    
    filtered = filtered.filter((up: any) => {
      // ✅ USAR ENGAGEMENT MÉDIO DO USER (não do produto individual)
      const level = (up.userId?.averageEngagementLevel || 
                    up.averageEngagementLevel || 
                    'MUITO_BAIXO').toUpperCase()
      return levels.includes(level)
    })
    
    console.log(`🔍 [Filtro EngagementLevel] "${engagementLevel}": ${filtered.length} resultados`)
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
    console.log(`🏆 [Filtro Top ${percentage}%] Iniciando...`)
    console.log(`   Total ANTES do filtro: ${filtered.length} UserProducts`)
    
    // ════════════════════════════════════════════════════════════════
    // PASSO 1: AGRUPAR por USER único (pegar o melhor UP de cada user)
    // ════════════════════════════════════════════════════════════════
    const uniqueUsers = new Map<string, any>()
    
    filtered.forEach((up: any) => {
      const userId = up.userId?._id?.toString() || up.userId?.toString()
      if (!userId) return
      
      const existingUP = uniqueUsers.get(userId)
      const currentEngagement = up.userId?.averageEngagement || up.averageEngagement || 0
      const existingEngagement = existingUP?.userId?.averageEngagement || existingUP?.averageEngagement || 0
      
      // Manter o UserProduct com MAIOR engagement médio deste user
      if (!existingUP || currentEngagement > existingEngagement) {
        uniqueUsers.set(userId, up)
      }
    })
    
    console.log(`   Users únicos encontrados: ${uniqueUsers.size}`)
    
    // ════════════════════════════════════════════════════════════════
    // PASSO 2: ORDENAR users por engagement médio (decrescente)
    // ════════════════════════════════════════════════════════════════
    const uniqueUsersArray = Array.from(uniqueUsers.values())
    uniqueUsersArray.sort((a, b) => {
      const scoreA = a.userId?.averageEngagement || a.averageEngagement || 0
      const scoreB = b.userId?.averageEngagement || b.averageEngagement || 0
      return scoreB - scoreA
    })
    
    // ════════════════════════════════════════════════════════════════
    // PASSO 3: PEGAR top N% de USERS
    // ════════════════════════════════════════════════════════════════
    const topCount = Math.ceil(uniqueUsersArray.length * (percentage / 100))
    const topUsers = uniqueUsersArray.slice(0, topCount)
    
    console.log(`   Top ${percentage}% = ${topCount} users`)
    


    
    // ════════════════════════════════════════════════════════════════
    // PASSO 4: CRIAR Set de userId dos top users
    // ════════════════════════════════════════════════════════════════
    const topUserIds = new Set<string>(
      topUsers.map(u => u.userId?._id?.toString() || u.userId?.toString()).filter(Boolean)
    )
    
    console.log(`   IDs dos top users:`, Array.from(topUserIds).slice(0, 5), '...')
    
    // ════════════════════════════════════════════════════════════════
    // PASSO 5: FILTRAR para manter TODOS os UserProducts dos top users
    // ════════════════════════════════════════════════════════════════
    filtered = filtered.filter((up: any) => {
      const userId = up.userId?._id?.toString() || up.userId?.toString()
      return userId && topUserIds.has(userId)
    })
    
    console.log(`✅ [Filtro Top ${percentage}%] Total DEPOIS: ${filtered.length} UserProducts (de ${topCount} users)`)
    
    // ════════════════════════════════════════════════════════════════
    // VALIDAÇÃO: Verificar se realmente filtramos corretamente
    // ════════════════════════════════════════════════════════════════
    const finalUniqueUsers = new Set(
      filtered.map((up: any) => up.userId?._id?.toString() || up.userId?.toString())
    )
    console.log(`   ✓ Validação: ${finalUniqueUsers.size} users únicos no resultado final`)
    
    if (finalUniqueUsers.size !== topCount) {
      console.warn(`   ⚠️ AVISO: Esperado ${topCount} users, mas temos ${finalUniqueUsers.size}`)
    }
  }
}

        // ──────────────────────────────────────────────────────────
    // 3.9. DEDUPLICATE: Manter apenas 1 UserProduct por User
    // ──────────────────────────────────────────────────────────
    console.log('🔄 [DEDUPLICATE] Removendo UserProducts duplicados por user...')
    console.log(`   Total ANTES: ${filtered.length} UserProducts`)
    
    const uniqueUsersMap = new Map<string, any>()
    
    filtered.forEach((up: any) => {
      const userId = up.userId?._id?.toString() || up.userId?.toString()
      
      if (!userId) {
        console.log('   ⚠️ UserProduct sem userId:', up._id)
        return
      }
      
      const existing = uniqueUsersMap.get(userId)
      const currentEngagement = up.userId?.averageEngagement || up.averageEngagement || 0
      const existingEngagement = existing?.userId?.averageEngagement || existing?.averageEngagement || 0
      
      // Manter o UserProduct com MAIOR engagement médio
      // (se user tem múltiplos produtos, mostrar só o melhor)
      if (!existing || currentEngagement > existingEngagement) {
        uniqueUsersMap.set(userId, up)
      }
    })
    
    // Substituir filtered pelos users únicos
    filtered = Array.from(uniqueUsersMap.values())
    
    console.log(`✅ [DEDUPLICATE] Total DEPOIS: ${filtered.length} Users únicos`)
    
    // Validação: garantir que não há users duplicados
    const userIds = filtered.map((up: any) => 
      up.userId?._id?.toString() || up.userId?.toString()
    )
    const uniqueCount = new Set(userIds).size
    
    if (uniqueCount !== filtered.length) {
      console.warn(`   ⚠️ AVISO: Ainda há duplicados! ${filtered.length} items mas ${uniqueCount} users únicos`)
    } else {
      console.log(`   ✓ Validação: Todos os users são únicos ✅`)
    }
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
router.get('/v2/stats', async (req, res) => {
  try {
    console.log('\n🎯 [/v2/stats] Calculando stats alinhados...')
    
    const UserProduct = require('../models/UserProduct').default
    const User = require('../models/user').default
    
    // 1. BASE: UserProducts ACTIVE
    const active = await UserProduct.find({ status: 'ACTIVE' })
      .populate('userId', 'name email')
      .lean()
    
    console.log(`✅ Base: ${active.length} UserProducts ACTIVE`)
    
    // 2. EM RISCO: engagement <= 30
    const atRisk = active.filter(up => 
      (up.engagement?.engagementScore || 0) <= 30
    )
    console.log(`🚨 Em Risco: ${atRisk.length}`)
    
    // 3. TOP 10%
    const sorted = [...active].sort((a, b) => 
      (b.engagement?.engagementScore || 0) - (a.engagement?.engagementScore || 0)
    )
    const top10Count = Math.ceil(active.length * 0.10)
    const topPerformers = sorted.slice(0, top10Count)
    console.log(`🏆 Top 10%: ${topPerformers.length}`)
    
    // 4. INATIVOS 30D
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const inactiveUsers = await User.find({
      'discord.engagement.lastMessageDate': { $lt: thirtyDaysAgo }
    }).select('_id').lean()
    
    const inactiveIds = new Set(inactiveUsers.map(u => u._id.toString()))
    
    const inactive30d = active.filter(up => {
      const userId = up.userId?._id?.toString() || up.userId?.toString()
      return inactiveIds.has(userId)
    })
    console.log(`😴 Inativos 30d: ${inactive30d.length}`)
    
    // 5. NOVOS 7D
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const new7d = active.filter(up => 
      up.enrolledAt && new Date(up.enrolledAt) >= sevenDaysAgo
    )
    console.log(`📅 Novos 7d: ${new7d.length}`)
    
    // 6. CALCULAR DISTRIBUIÇÃO POR PLATAFORMA
    const platformCounts = new Map<string, number>()
    active.forEach(up => {
      const platform = up.platform || 'unknown'
      platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1)
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
    }).sort((a, b) => b.count - a.count)
    
    console.log(`📦 Plataformas:`, byPlatform)
    
    // 7. RESPOSTA
    res.json({
      success: true,
      data: {
        overview: {
          totalStudents: active.length,
          avgEngagement: active.reduce((sum, up) => sum + (up.engagement?.engagementScore || 0), 0) / active.length,
          avgProgress: active.reduce((sum, up) => sum + (up.progress?.percentage || 0), 0) / active.length,
          activeCount: active.length,
          activeRate: 100,
          atRiskCount: atRisk.length,
          atRiskRate: (atRisk.length / active.length) * 100,
          activeProducts: new Set(active.map(up => up.productId?.toString())).size,
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
    const Product = require('../models/Product').default
    
    // 1. Buscar todos os produtos
    const products = await Product.find({}).lean()
    console.log(`   📦 ${products.length} produtos encontrados`)
    
    // 2. Buscar UserProducts ATIVOS
    const userProducts = await UserProduct.find({ status: 'ACTIVE' })
      .populate('userId', 'name email')
      .lean()
    
    console.log(`   👥 ${userProducts.length} UserProducts ACTIVE`)
    
    // 3. Calcular engagement médio de todos
    const uniqueUserIds: string[] = [...new Set<string>(
  userProducts
    .map((up: any) => up.userId?._id?.toString() || up.userId?.toString())
    .filter((id): id is string => Boolean(id))  // type guard
)];

    const averageEngagements = await calculateBatchAverageEngagement(uniqueUserIds)
    
    // 4. Enriquecer UserProducts com engagement médio
    userProducts.forEach((up: any) => {
      if (up.userId && up.userId._id) {
        const userId = up.userId._id.toString()
        const engData = averageEngagements.get(userId)
        if (engData) {
          up.averageEngagement = engData.averageScore
          up.averageEngagementLevel = engData.level
        }
      }
    })
    
    // 5. Agrupar por produto
    const comparison = products.map((product: any) => {
      const productUserProducts = userProducts.filter(
        (up: any) => up.productId?.toString() === product._id.toString()
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
      
      // Calcular score médio
      const scores = productUserProducts
        .map((up: any) => up.averageEngagement || 0)
        .filter(s => s > 0)
      
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0
      
      // Distribuição por níveis
      const alto = productUserProducts.filter((up: any) => 
        (up.averageEngagement || 0) >= 60
      ).length
      
      const medio = productUserProducts.filter((up: any) => {
        const score = up.averageEngagement || 0
        return score >= 40 && score < 60
      }).length
      
      const baixo = productUserProducts.filter((up: any) => {
        const score = up.averageEngagement || 0
        return score >= 25 && score < 40
      }).length
      
      const risco = productUserProducts.filter((up: any) => 
        (up.averageEngagement || 0) < 25
      ).length
      
      const total = productUserProducts.length
      
      return {
        productId: product._id,
        productName: product.name,
        platform: product.platform,
        totalStudents: total,
        avgScore,
        trend: 0, // TODO: Calcular vs 7 dias atrás
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
    
    // 6. Ordenar por total de alunos (maior primeiro)
    comparison.sort((a, b) => b.totalStudents - a.totalStudents)
    
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
    
    // 1. Buscar UserProducts com filtros
    const query: any = { status: 'ACTIVE' }
    if (productId) query.productId = productId
    if (platform) query.platform = platform
    
    const userProducts = await UserProduct.find(query)
      .populate('userId', 'name email')
      .lean()
    
    console.log(`   👥 ${userProducts.length} UserProducts encontrados`)
    
    // 2. Buscar dados de atividade do Discord (última atividade por dia)
    const userIds = userProducts.map((up: any) => up.userId?._id).filter(Boolean)
    
    const users = await User.find({
      _id: { $in: userIds }
    }).select('discord.engagement.lastMessageDate discord.lastMessageDate').lean()
    
    // 3. Gerar últimas 4 semanas
    const weeks = []
    const now = new Date()
    
    for (let weekOffset = 3; weekOffset >= 0; weekOffset--) {
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - (weekOffset * 7) - now.getDay() + 1) // Segunda-feira
      weekStart.setHours(0, 0, 0, 0)
      
      const days = []
      
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDay = new Date(weekStart)
        currentDay.setDate(currentDay.getDate() + dayOffset)
        
        const nextDay = new Date(currentDay)
        nextDay.setDate(nextDay.getDate() + 1)
        
        // Contar quantos users estavam ativos nesse dia
        const activeOnDay = users.filter((u: any) => {
          const lastMsg = u.discord?.engagement?.lastMessageDate || u.discord?.lastMessageDate
          if (!lastMsg) return false
          
          const msgDate = new Date(lastMsg)
          return msgDate >= currentDay && msgDate < nextDay
        }).length
        
        // Score médio (simular por agora - pode melhorar com dados reais)
        // Padrão: Seg-Qui alto, Sex médio, Sáb-Dom baixo
        let simulatedScore = 45
        if (dayOffset === 0 || dayOffset === 1 || dayOffset === 2) simulatedScore = 50 // Seg-Qua
        else if (dayOffset === 3) simulatedScore = 52 // Qui (pico)
        else if (dayOffset === 4) simulatedScore = 42 // Sex
        else if (dayOffset === 5) simulatedScore = 28 // Sáb
        else simulatedScore = 25 // Dom (mínimo)
        
        // Adicionar variação aleatória ±5
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
    
    // 4. Calcular insights
    const allDays = weeks.flatMap(w => w.days)
    const dayScores = new Map<string, number[]>()
    
    allDays.forEach(d => {
      if (!dayScores.has(d.day)) dayScores.set(d.day, [])
      dayScores.get(d.day)!.push(d.avgScore)
    })
    
    const avgByDay = Array.from(dayScores.entries()).map(([day, scores]) => ({
      day,
      avg: scores.reduce((sum, s) => sum + s, 0) / scores.length
    }))
    
    avgByDay.sort((a, b) => b.avg - a.avg)
    
    const bestDay = avgByDay[0].day
    const worstDay = avgByDay[avgByDay.length - 1].day
    
    const weekdayAvg = avgByDay.slice(0, 5).reduce((sum, d) => sum + d.avg, 0) / 5
    const weekendAvg = avgByDay.slice(5).reduce((sum, d) => sum + d.avg, 0) / 2
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
