// src/controllers/curseduca.controller.ts - CONTROLLER UNIFICADO (v1 + v2) COM TIPOS CORRIGIDOS
// ✅ Limpo (sem double-response) + Universal Sync + compatível com o novo adapter (platformData.isPrimary/isDuplicate)

import { Request, Response } from 'express'
import User from '../../models/user'
import Product from '../../models/Product'
import {
  testCurseducaConnection,
  syncCurseducaMembers,
  syncCurseducaProgress,
  getCurseducaDashboardStats
} from '../../services/curseducaService'
import {
  getUsersByProduct as getUsersByProductService,
  getUserCountForProduct
} from '../../services/userProductService'
import { SyncHistory } from '../../models'
import universalSyncService, {
  SyncError,
  SyncProgress,
  SyncWarning
} from '../../services/syncUtilziadoresServices/universalSyncService'
import curseducaAdapter from '../../services/syncUtilziadoresServices/curseducaServices/curseduca.adapter'

// ─────────────────────────────────────────────────────────────
// Tipos auxiliares (para calar TS sem mexer nos services)
// ─────────────────────────────────────────────────────────────

type ServiceResult<TStats = unknown> = {
  success: boolean
  message?: string
  details?: unknown
  stats?: TStats
}

type DashboardRawStats = {
  totalUsers: number
  activeUsers: number
  totalUserProducts: number
  products: number
}

function isServiceResult(val: unknown): val is { success: boolean; message?: string } {
  return !!val && typeof val === 'object' && 'success' in val
}

// ─────────────────────────────────────────────────────────────
// 🧪 TESTE DE CONEXÃO
// ─────────────────────────────────────────────────────────────

export const testConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🧪 === TESTE DE CONEXÃO CURSEDUCA ===')
    const result = (await testCurseducaConnection()) as ServiceResult

    console.log(`${result.success ? '✅' : '❌'} Resultado:`, result.message)

    res.status(result.success ? 200 : 500).json({
      success: result.success,
      message: result.message,
      details: result.details,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Erro no teste de conexão:', error)
    res.status(500).json({
      success: false,
      message: `Erro interno: ${error.message}`,
      timestamp: new Date().toISOString()
    })
  }
}

// ─────────────────────────────────────────────────────────────
// 🔄 SINCRONIZAÇÃO COMPLETA (LEGACY)
// ─────────────────────────────────────────────────────────────

export const syncCurseducaUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🚀 === CONTROLLER: SINCRONIZAÇÃO CURSEDUCA (LEGACY) ===')

    type SyncMembersStats = {
      groupsProcessed?: number
      created: number
      updated: number
      skipped: number
      errors: number
    }

    const result = (await syncCurseducaMembers()) as ServiceResult<SyncMembersStats>

    const message =
      result.message ??
      (result.success ? 'Sincronização concluída com sucesso' : 'Falha na sincronização')

    console.log(`${result.success ? '✅' : '❌'} Resultado:`, message)
    console.log('📊 Estatísticas:', result.stats)

    res.status(result.success ? 200 : 500).json({
      success: result.success,
      message,
      ...(result.success ? {} : { error: message }),
      stats:
        result.stats || ({
          groupsProcessed: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: 1
        } as SyncMembersStats)
    })
  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error)
    res.status(500).json({
      success: false,
      message: 'Erro crítico na sincronização com CursEduca',
      error: error.message,
      details: error.stack
    })
  }
}

// ─────────────────────────────────────────────────────────────
// 📈 SINCRONIZAÇÃO APENAS PROGRESSO (LEGACY)
// ─────────────────────────────────────────────────────────────

export const syncProgressOnly = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📈 === CONTROLLER: SINCRONIZAÇÃO PROGRESSO CURSEDUCA (LEGACY) ===')

    const result = (await syncCurseducaProgress()) as ServiceResult<{
      total: number
      withProgress: number
      errors: number
    }>

    res.status(result.success ? 200 : 500).json({
      success: result.success,
      message: result.message,
      ...(result.success ? {} : { error: result.message }),
      stats:
        result.stats || {
          total: 0,
          withProgress: 0,
          errors: 1
        }
    })
  } catch (error: any) {
    console.error('❌ Erro na sincronização de progresso:', error)
    res.status(500).json({
      success: false,
      message: 'Erro na sincronização de progresso CursEduca',
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// 📊 DASHBOARD STATS
// ─────────────────────────────────────────────────────────────

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 === CONTROLLER: DASHBOARD CURSEDUCA ===')

    const raw = (await getCurseducaDashboardStats()) as unknown

    // Caso o service já devolva { success, message, ... }
    if (isServiceResult(raw)) {
      const result = raw as { success: boolean; message?: string }
      if (result.success) {
        res.status(200).json(raw)
      } else {
        res.status(500).json({
          success: false,
          message: result.message || 'Erro ao buscar dashboard',
          timestamp: new Date().toISOString()
        })
      }
      return
    }

    // Caso o service devolva só stats (sem success/message)
    const stats = raw as DashboardRawStats
    res.status(200).json({
      success: true,
      message: 'Dashboard carregado com sucesso',
      ...stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar dashboard:', error)
    res.status(500).json({
      success: false,
      message: `Erro interno: ${error.message}`,
      timestamp: new Date().toISOString()
    })
  }
}

// ─────────────────────────────────────────────────────────────
// 🔍 ENDPOINTS DE COMPATIBILIDADE (ainda 501)
// ─────────────────────────────────────────────────────────────

export const getGroups = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint de grupos não implementado ainda',
    note: 'Use /syncCurseducaUsers para sincronização completa'
  })
}

export const getMembers = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint de membros não implementado ainda',
    note: 'Use /syncCurseducaUsers para sincronização completa'
  })
}

export const getMemberByEmail = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Busca por email não implementada ainda',
    note: 'Use User.findOne({email}) na base de dados local'
  })
}

export const getAccessReports = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Relatórios de acesso não implementados ainda',
    note: 'Use /dashboard para estatísticas gerais'
  })
}

export const getCurseducaUsers = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Listagem de utilizadores não implementada ainda',
    note: 'Use GET /api/users?source=CURSEDUCA'
  })
}

export const debugCurseducaAPI = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Debug da API não implementado ainda',
    note: 'Use /test para testar conexão básica'
  })
}

export const syncCurseducaUsersIntelligent = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Sincronização inteligente não implementada ainda',
    note: 'Esta funcionalidade será implementada em versão futura'
  })
}

export const getSyncReport = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Relatório de sincronização não implementado ainda',
    note: 'Use /dashboard para estatísticas atuais'
  })
}

export const getUserByEmail = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Busca por email não implementada ainda',
    note: 'Use GET /api/users/{id} ou consulte diretamente a BD'
  })
}

export const cleanupDuplicates = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Limpeza de duplicados não implementada ainda',
    note: 'Esta funcionalidade será implementada quando necessária'
  })
}

// ─────────────────────────────────────────────────────────────
// ✅ UTILITÁRIOS: Turmas
// ─────────────────────────────────────────────────────────────

export const getUsersWithClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({
      'curseduca.curseducaUserId': { $exists: true }
    })
      .select('name email curseduca.enrolledClasses curseduca.groupName')
      .lean()

    const stats = {
      total: users.length,
      withSingleClass: users.filter((u: any) => u.curseduca?.enrolledClasses?.length === 1).length,
      withMultipleClasses: users.filter((u: any) => u.curseduca?.enrolledClasses?.length > 1).length,
      withoutClasses: users.filter((u: any) => !u.curseduca?.enrolledClasses?.length).length
    }

    res.json({ success: true, users, stats })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateUserClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params
    const { enrolledClasses } = req.body

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'curseduca.enrolledClasses': enrolledClasses,
          'metadata.updatedAt': new Date()
        }
      },
      { new: true }
    )

    res.json({ success: true, user })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// ===============================
// 🎯 V2 - CURSEDUCA (SPRINT 5.2)
// ===============================

/**
 * GET /api/curseduca/v2/products
 * Lista todos os produtos CursEduca
 */
export const getCurseducaProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'curseduca' })
      .select('name code platformData isActive')
      .lean()

    res.json({
      success: true,
      data: products,
      count: products.length,
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

/**
 * GET /api/curseduca/v2/products/:groupId
 * Procura produto por groupId (compatível com diferentes nomes em platformData)
 */
export const getCurseducaProductByGroupId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params

    const product = await Product.findOne({
      platform: 'curseduca',
      $or: [
        { 'platformData.groupId': groupId },
        { 'platformData.curseducaGroupId': groupId },
        { 'platformData.groupCurseducaUuid': groupId }
      ]
    }).lean()

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    const userCount = await getUserCountForProduct(String((product as any)._id))

    res.json({
      success: true,
      data: { ...product, userCount },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

/**
 * GET /api/curseduca/v2/products/:groupId/users?minProgress=XX
 */
export const getCurseducaProductUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params
    const { minProgress } = req.query

    const product = await Product.findOne({
      platform: 'curseduca',
      $or: [
        { 'platformData.groupId': groupId },
        { 'platformData.curseducaGroupId': groupId },
        { 'platformData.groupCurseducaUuid': groupId }
      ]
    })

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    let users = await getUsersByProductService(String(product._id))

    // Robustez: aceitar progressPercentage antigo e percentage novo
    if (minProgress) {
      const minProg = parseInt(minProgress as string, 10)
      users = users.filter((u: any) =>
        u.products?.some((p: any) => {
          const sameProduct = String(p.product?._id) === String(product._id)
          const prog =
            p.progress?.percentage ??
            p.progress?.progressPercentage ??
            p.progress?.estimatedProgress ??
            0
          return sameProduct && prog >= minProg
        })
      )
    }

    res.json({
      success: true,
      data: users,
      count: users.length,
      filters: { minProgress },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

/**
 * GET /api/curseduca/v2/stats
 * Estatísticas gerais dos produtos CursEduca
 */
export const getCurseducaStats = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'curseduca' }).lean()

    const stats = await Promise.all(
      products.map(async (product: any) => {
        const users = await getUsersByProductService(String(product._id))

        const avgProgress =
          users.length > 0
            ? users.reduce((sum: number, u: any) => {
                const productData = u.products?.find(
                  (p: any) => String(p.product?._id) === String(product._id)
                )
                const prog =
                  productData?.progress?.percentage ??
                  productData?.progress?.progressPercentage ??
                  productData?.progress?.estimatedProgress ??
                  0
                return sum + prog
              }, 0) / users.length
            : 0

        return {
          productId: product._id,
          productName: product.name,
          groupId:
            product.platformData?.groupId ||
            product.platformData?.curseducaGroupId ||
            product.platformData?.groupCurseducaUuid,
          totalUsers: users.length,
          averageProgress: Math.round(avgProgress)
        }
      })
    )

    res.json({
      success: true,
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsers: stats.reduce((sum, s) => sum + s.totalUsers, 0),
        overallAvgProgress: Math.round(
          stats.reduce((sum, s) => sum + s.averageProgress, 0) / (stats.length || 1)
        )
      },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ UNIVERSAL SYNC ENDPOINTS (NOVOS)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/curseduca/sync/universal
 * Sincronização CursEduca usando Universal Sync Service
 * ✅ Adapter com deduplicação e platformData.isPrimary/isDuplicate
 */
export const syncCurseducaUsersUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('🚀 [CurseducaUniversal] Iniciando sync via Universal Service...')

  try {
    console.log('📡 [CurseducaUniversal] Buscando dados via Adapter...')

    const { groupId } = req.query

    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId as string | undefined,
      progressConcurrency: 5
    })

    console.log(`✅ [CurseducaUniversal] ${curseducaData.length} membros preparados`)

    if (curseducaData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum membro encontrado na CursEduca',
        data: { stats: { total: 0, inserted: 0, updated: 0, errors: 0 } },
        _universalSync: true,
        _version: '3.0'
      })
      return
    }

    console.log('⚡ [CurseducaUniversal] Executando Universal Sync...')

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'CursEduca Universal Sync (Manual)',
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),

      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,

      sourceData: curseducaData,

      onProgress: (progress: SyncProgress) => {
        if (progress.current % 50 === 0 || progress.percentage === 100) {
          console.log(
            `📊 [CurseducaUniversal] ${progress.percentage.toFixed(1)}% (${progress.current}/${progress.total})`
          )
        }
      },

      onError: (error: SyncError) => {
        console.error(`❌ [CurseducaUniversal] Erro: ${error.message}`)
      },

      onWarning: (warning: SyncWarning) => {
        console.warn(`⚠️ [CurseducaUniversal] Aviso: ${warning.message}`)
      }
    })

    console.log('✅ [CurseducaUniversal] Sync concluída!')
    console.log(`   ⏱️ Duração: ${result.duration}s`)
    console.log(`   ✅ Inseridos: ${result.stats.inserted}`)
    console.log(`   🔄 Atualizados: ${result.stats.updated}`)
    console.log(`   ❌ Erros: ${result.stats.errors}`)

    // ✅ PATCH: Invalidar cache e rebuild stats (sem rebentar se não existir no projeto)
    try {
      console.log('🔄 [CurseducaUniversal] Invalidando cache e reconstruindo stats...')
      const dualRead = await import('../../services/dualReadService').catch(() => null as any)
      if (dualRead?.clearUnifiedCache) dualRead.clearUnifiedCache()

      const builder = await import('../../services/dashboardStatsBuilder.service').catch(() => null as any)
      if (builder?.buildDashboardStats) await builder.buildDashboardStats()

      console.log('✅ [CurseducaUniversal] Stats atualizados!')
    } catch (e: any) {
      console.warn('⚠️ [CurseducaUniversal] Falha ao rebuild stats (ignorado):', e?.message)
    }

    res.status(200).json({
      success: result.success,
      message: result.success
        ? 'Sincronização via Universal Service concluída com sucesso!'
        : 'Sincronização concluída com erros',
      data: {
        reportId: result.reportId,
        syncHistoryId: result.syncHistoryId,
        stats: result.stats,
        duration: result.duration,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length,
        reportUrl: `/api/sync/reports/${result.reportId}`,
        syncHistoryUrl: `/api/sync/history/${result.syncHistoryId}`
      },
      _universalSync: true,
      _version: '3.0'
    })
  } catch (error: any) {
    console.error('❌ [CurseducaUniversal] Erro fatal:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao executar sincronização via Universal Service',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * POST /api/curseduca/sync/universal/progress
 * Sincronizar apenas progresso usando Universal Sync
 */
export const syncProgressOnlyUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('📊 [CurseducaProgress] Iniciando sync de progresso via Universal...')

  try {
    const existingUsers = await User.find({
      $or: [
        { 'curseduca.curseducaUserId': { $exists: true, $nin: [null, ''] } },
        { 'curseduca.curseducaUuid': { $exists: true, $nin: [null, ''] } }
      ]
    })
      .select('curseduca.curseducaUserId curseduca.curseducaUuid email name')
      .lean()

    console.log(`📊 [CurseducaProgress] ${existingUsers.length} utilizadores com CursEduca ID`)

    if (existingUsers.length === 0) {
      res.status(200).json({
        success: true,
        message: 'Nenhum utilizador com CursEduca ID encontrado',
        data: { stats: { total: 0 } },
        _universalSync: true,
        _progressOnly: true
      })
      return
    }

    // CursEduca: progresso vem da API principal (não tem endpoint dedicado)
    console.log('⚠️ [CurseducaProgress] CursEduca não tem endpoint dedicado para progresso')
    console.info('   💡 Executando sync completo filtrado por users existentes')

    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: false, // não precisamos reescrever grupos
      progressConcurrency: 5
    })

    // Filtrar apenas users existentes (por email)
    const existingEmails = new Set(existingUsers.map((u: any) => String(u.email).toLowerCase().trim()))
    const filteredData = curseducaData.filter((item: any) =>
      existingEmails.has(String(item.email).toLowerCase().trim())
    )

    console.log(`📊 [CurseducaProgress] ${filteredData.length} users para atualizar progresso`)

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'CursEduca Progress Sync (Universal)',
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),

      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 100,

      sourceData: filteredData
    })

    res.status(200).json({
      success: result.success,
      message: 'Progresso sincronizado via Universal Service!',
      data: {
        reportId: result.reportId,
        stats: result.stats,
        duration: result.duration
      },
      _universalSync: true,
      _progressOnly: true
    })
  } catch (error: any) {
    console.error('❌ [CurseducaProgress] Erro:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * GET /api/curseduca/sync/compare
 * Comparar resultados: Legacy vs Universal
 */
export const compareSyncMethods = async (req: Request, res: Response): Promise<void> => {
  try {
    const SyncReport = (await import('../../models/SyncModels/SyncReport')).default as any

    // ✅ Query flexível para encontrar qualquer formato
    const legacyHistory = await SyncHistory.find({
      $or: [
        { type: 'curseduca' }, // Universal
        { syncType: 'CURSEDUCA' }, // Legacy uppercase
        { type: 'CURSEDUCA' } // Mixed
      ]
    })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats type')
      .lean()

    const universalReports = await SyncReport.find({ syncType: 'curseduca' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats duration')
      .lean()

    res.json({
      success: true,
      data: {
        legacy: {
          count: legacyHistory.length,
          latest: legacyHistory[0],
          all: legacyHistory
        },
        universal: {
          count: universalReports.length,
          latest: universalReports[0],
          all: universalReports
        },
        comparison: {
          avgDurationLegacy:
            legacyHistory.reduce((sum: number, h: any) => {
              const duration =
                h.completedAt && h.startedAt
                  ? (new Date(h.completedAt).getTime() - new Date(h.startedAt).getTime()) / 1000
                  : 0
              return sum + duration
            }, 0) / (legacyHistory.length || 1),

          avgDurationUniversal:
            universalReports.reduce((sum: number, r: any) => sum + (r.duration || 0), 0) /
            (universalReports.length || 1)
        }
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}
