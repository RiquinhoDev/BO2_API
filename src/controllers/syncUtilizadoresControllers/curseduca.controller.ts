// ════════════════════════════════════════════════════════════
// 📁 src/controllers/curseduca.controller.ts
// Controller CursEduca - VERSÃO FINAL (100% Universal Sync)
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import type { CrossReferenceResult } from '../../services/guru/crossReference.service'
import type { SyncError, SyncProgress, SyncWarning } from '../../types/universalSync.types'
import type { CurseducaCleanupInput } from '../../security/curseducaDestructiveInput'
import fs from 'fs'
import path from 'path'
import User from '../../models/user'
import Product from '../../models/product/Product'
import { SyncHistory, UserProduct } from '../../models'
import {
  getUsersByProduct as getUsersByProductService,
  getUserCountForProduct
} from '../../services/userProducts/userProductService'
import universalSyncService from '../../services/syncUtilizadoresServices/universalSyncService'
import curseducaAdapter from '../../services/syncUtilizadoresServices/curseducaServices/curseduca.adapter'

interface ProductUserView {
  products?: Array<{
    product?: { _id?: unknown }
    progress?: { percentage?: number }
  }>
}

interface SyncResponse {
  status(code: number): SyncResponse
  json(payload: Record<string, unknown>): SyncResponse
}

interface BackgroundSyncResult extends Record<string, unknown> {
  httpStatus: number
}

declare global {
  var __curseducaSyncRunning: boolean | undefined
  var __curseducaSyncStartedAt: Date | undefined
  var __curseducaSyncFinishedAt: Date | null | undefined
  var __curseducaSyncResult: BackgroundSyncResult | null | undefined
  var __curseducaSyncError: string | null | undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

// ═══════════════════════════════════════════════════════════
// SYNC LOGGER
// ═══════════════════════════════════════════════════════════

class SyncLogger {
  private logFile: string
  private startTime: number

  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.logFile = path.join(process.cwd(), 'logs', `curseduca-sync-${timestamp}.log`)
    this.startTime = Date.now()
    
    const logDir = path.dirname(this.logFile)
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    
    this.log('═'.repeat(80))
    this.log('🚀 CURSEDUCA UNIVERSAL SYNC - DEBUG LOG')
    this.log('═'.repeat(80))
    this.log(`📅 Início: ${new Date().toLocaleString('pt-PT')}`)
    this.log(`📁 Log File: ${this.logFile}`)
    this.log('═'.repeat(80))
    this.log('')
  }

  log(message: string) {
    const timestamp = new Date().toISOString()
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2)
    const line = `[${timestamp}] [+${elapsed}s] ${message}`
    
    console.log(message)
    fs.appendFileSync(this.logFile, line + '\n')
  }

  section(title: string) {
    this.log('')
    this.log('─'.repeat(80))
    this.log(`📍 ${title}`)
    this.log('─'.repeat(80))
  }

  success(message: string) {
    this.log(`✅ ${message}`)
  }

  error(message: string) {
    this.log(`❌ ${message}`)
  }

  warn(message: string) {
    this.log(`⚠️  ${message}`)
  }

  info(message: string) {
    this.log(`ℹ️  ${message}`)
  }

  getLogPath() {
    return this.logFile
  }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getCurseducaDashboardStats()
    
    res.status(200).json({
      success: true,
      message: 'Dashboard carregado com sucesso',
      ...stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      message: `Erro interno: ${errorMessage(error)}`,
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * Obter estatísticas do dashboard CursEduca
 */
export const getCurseducaDashboardStats = async () => {
  try {
    console.log('📊 [DASHBOARD] Calculando estatísticas CursEduca...')
    
    const curseducaProducts = await Product.find({
      platform: 'curseduca',
      isActive: true
    })
    
    const totalUsers = await User.countDocuments({
      'curseduca.curseducaUserId': { $exists: true, $ne: null }
    })
    
    const activeUsers = await User.countDocuments({
      'curseduca.memberStatus': 'ACTIVE'
    })
    
    const totalUserProducts = await UserProduct.countDocuments({
      productId: { $in: curseducaProducts.map(p => p._id) }
    })
    
    console.log('✅ Estatísticas calculadas')
    
    return {
      totalUsers,
      activeUsers,
      totalUserProducts,
      products: curseducaProducts.length
    }
  } catch (error: unknown) {
    console.error('❌ Erro ao calcular estatísticas:', errorMessage(error))
    throw error
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC PRINCIPAL (UNIVERSAL)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/curseduca/sync
 * Sincronização CursEduca usando Universal Sync Service
 */
export const syncCurseducaUsers = async (req: Request, res: SyncResponse): Promise<void> => {
  const logger = new SyncLogger()
  
  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 0: VALIDAR CREDENCIAIS
    // ═══════════════════════════════════════════════════════════
    
    logger.section('STEP 0: VALIDAR CREDENCIAIS')
    
    if (!process.env.CURSEDUCA_API_URL || !process.env.CURSEDUCA_AccessToken || !process.env.CURSEDUCA_API_KEY) {
      logger.error('Credenciais não configuradas!')
      
      res.status(400).json({
        success: false,
        message: 'Credenciais CursEduca não configuradas (.env)',
        missingVars: [
          !process.env.CURSEDUCA_API_URL && 'CURSEDUCA_API_URL',
          !process.env.CURSEDUCA_AccessToken && 'CURSEDUCA_AccessToken',
          !process.env.CURSEDUCA_API_KEY && 'CURSEDUCA_API_KEY'
        ].filter(Boolean)
      })
      return
    }
    
    logger.success('Credenciais validadas')

    // ═══════════════════════════════════════════════════════════
    // STEP 1: BUSCAR DADOS VIA ADAPTER
    // ═══════════════════════════════════════════════════════════
    
    logger.section('STEP 1: BUSCAR DADOS VIA ADAPTER')
    
    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined
    const enrichWithDetails = req.query.enrichWithDetails
    logger.info(`GroupId filter: ${groupId || 'TODOS'}`)
    logger.info(`Enrich with details: ${enrichWithDetails !== 'false'}`)

    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId,
      enrichWithDetails: enrichWithDetails !== 'false', // Default true
      progressConcurrency: 5
    })

    logger.success(`${curseducaData.length} membros preparados`)

    if (curseducaData.length === 0) {
      logger.warn('Nenhum membro encontrado!')
      res.status(200).json({
        success: false,
        message: 'Nenhum membro encontrado na CursEduca',
        logFile: logger.getLogPath(),
        data: { stats: { total: 0, inserted: 0, updated: 0, errors: 0 } }
      })
      return
    }

    // Debug: Mostrar sample dos dados
    logger.log('')
    logger.log('📋 SAMPLE DE DADOS DO ADAPTER (primeiros 3):')
    curseducaData.slice(0, 3).forEach((member, i) => {
      logger.log(`   ${i + 1}. ${member.email}`)
      logger.log(`      curseducaUserId: ${member.curseducaUserId}`)
      logger.log(`      groupId: ${member.groupId || 'N/A'}`)
      logger.log(`      groupName: ${member.groupName || 'N/A'}`)
      logger.log(`      subscriptionType: ${member.subscriptionType || 'N/A'}`)
      logger.log(`      lastLogin: ${member.lastLogin || 'N/A'}`)
      logger.log(`      situation: ${member.platformData?.situation || 'N/A'}`)
      logger.log(`      isPrimary: ${member.platformData?.isPrimary}`)
      logger.log('')
    })

    // ═══════════════════════════════════════════════════════════
    // STEP 2: EXECUTAR UNIVERSAL SYNC
    // ═══════════════════════════════════════════════════════════
    
    logger.section('STEP 2: EXECUTAR UNIVERSAL SYNC')

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'CursEduca Sync (API)',
      triggeredBy: 'MANUAL',
      triggeredByUser: req.user?.id,

      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,

      sourceData: curseducaData,

      onProgress: (progress: SyncProgress) => {
        if (progress.current % 50 === 0 || progress.percentage === 100) {
          logger.info(`Progresso: ${progress.percentage.toFixed(1)}% (${progress.current}/${progress.total})`)
        }
      },

      onError: (error: SyncError) => {
        logger.error(`Erro: ${error.message}`)
      },

      onWarning: (warning: SyncWarning) => {
        logger.warn(`Aviso: ${warning.message}`)
      }
    })

    logger.success('Sync concluído!')
    logger.log('')
    logger.log('📊 ESTATÍSTICAS:')
    logger.log(`   ⏱️  Duração: ${result.duration}s`)
    logger.log(`   ✅ Inseridos: ${result.stats.inserted}`)
    logger.log(`   🔄 Atualizados: ${result.stats.updated}`)
    logger.log(`   ⚠️  Inalterados: ${result.stats.unchanged || 0}`)
    logger.log(`   ❌ Erros: ${result.stats.errors}`)
    logger.log(`   📦 Total: ${result.stats.total}`)

    // ═══════════════════════════════════════════════════════════
    // STEP 3: VALIDAR USERPRODUCTS CRIADOS
    // ═══════════════════════════════════════════════════════════
    
    await validateUserProductsCreated(logger, 5)

    // ═══════════════════════════════════════════════════════════
    // STEP 3.5: CROSS-REFERENCE GURU VS CURSEDUCA
    // ═══════════════════════════════════════════════════════════

    logger.section('STEP 3.5: CROSS-REFERENCE GURU VS CURSEDUCA')

    let crossRefResult: CrossReferenceResult | null = null
    try {
      const { runCrossReferenceAfterCurseducaSync } = await import(
        '../../services/guru/crossReference.service'
      )

      const syncedEmails = curseducaData
        .map(member => member.email?.toLowerCase().trim())
        .filter((email): email is string => Boolean(email))

      // Reconciliação só no sync completo (sem filtro de grupo) e com volume mínimo seguro
      const isFullSync = !groupId
      crossRefResult = await runCrossReferenceAfterCurseducaSync(syncedEmails, {
        reconcileStale: isFullSync,
        minSyncSize: 400
      })

      logger.success(`Cross-reference concluído:`)
      logger.log(`   🔴 Marcados PARA_INATIVAR: ${crossRefResult.markedParaInativar}`)
      logger.log(`   🟢 Revertidos a ACTIVE: ${crossRefResult.revertedToActive}`)
      logger.log(`   ⚫ Confirmados INACTIVE: ${crossRefResult.confirmedInactive}`)
      logger.log(`   ⏭️ Ignorados: ${crossRefResult.skipped}`)
    } catch (error: unknown) {
      logger.warn(`Cross-reference falhou (não-fatal): ${errorMessage(error)}`)
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 4: REBUILD STATS
    // ═══════════════════════════════════════════════════════════
    
    logger.section('STEP 4: REBUILD DASHBOARD STATS')
    
    try {
      const dualRead = await import('../../services/syncUtilizadoresServices/dualReadService').catch(() => null)
      if (dualRead?.clearUnifiedCache) {
        dualRead.clearUnifiedCache()
        logger.success('Cache invalidado')
      }

      const builder = await import('../../services/dashboardStatsBuilder.service').catch(() => null)
      if (builder?.buildDashboardStats) {
        await builder.buildDashboardStats()
        logger.success('Stats reconstruídos')
      }
    } catch (error: unknown) {
      logger.warn(`Falha ao rebuild stats (ignorado): ${errorMessage(error)}`)
    }

    // ═══════════════════════════════════════════════════════════
    // FINAL: SUMÁRIO
    // ═══════════════════════════════════════════════════════════
    
    logger.section('SUMÁRIO FINAL')
    logger.log(`📁 Log completo: ${logger.getLogPath()}`)
    logger.log(`📊 ReportId: ${result.reportId}`)
    logger.log(`📊 SyncHistoryId: ${result.syncHistoryId}`)
    logger.log('')
    logger.log('═'.repeat(80))
    logger.success('SYNC COMPLETO!')
    logger.log('═'.repeat(80))

    res.status(200).json({
      success: result.success,
      message: result.success
        ? 'Sincronização concluída com sucesso!'
        : 'Sincronização concluída com erros',
      logFile: logger.getLogPath(),
      data: {
        reportId: result.reportId,
        syncHistoryId: result.syncHistoryId,
        stats: result.stats,
        duration: result.duration,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length,
        reportUrl: `/api/sync/reports/${result.reportId}`,
        syncHistoryUrl: `/api/sync/history/${result.syncHistoryId}`,
        crossReference: crossRefResult ? {
          processed: crossRefResult.processed,
          markedParaInativar: crossRefResult.markedParaInativar,
          revertedToActive: crossRefResult.revertedToActive,
          confirmedInactive: crossRefResult.confirmedInactive,
          reconciledStale: crossRefResult.reconciledStale,
          skipped: crossRefResult.skipped,
          errors: crossRefResult.errors,
          duration: crossRefResult.duration
        } : null
      },
      _universalSync: true,
      _version: '3.1'
    })
  } catch (error: unknown) {
    logger.error(`Erro fatal: ${errorMessage(error)}`)
    logger.log(errorStack(error) || '')
    
    res.status(500).json({
      success: false,
      message: 'Erro ao executar sincronização',
      error: errorMessage(error),
      logFile: logger.getLogPath(),
      stack: process.env.NODE_ENV === 'development' ? errorStack(error) : undefined
    })
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: VALIDAR USERPRODUCTS
// ═══════════════════════════════════════════════════════════

async function validateUserProductsCreated(logger: SyncLogger, sampleSize = 5) {
  logger.section('VALIDAÇÃO DE USERPRODUCTS')
  
  try {
    // Buscar produtos CursEduca
    const curseducaProducts = await Product.find({
      platform: 'curseduca',
      isActive: true
    }).select('_id code name')

    logger.info(`Produtos CursEduca encontrados: ${curseducaProducts.length}`)
    curseducaProducts.forEach(p => {
      logger.log(`   - ${p.code}: ${p.name} (${p._id})`)
    })

    if (curseducaProducts.length === 0) {
      logger.error('NENHUM produto CursEduca encontrado na BD!')
      return
    }

    // Buscar UserProducts CursEduca
    const productIds = curseducaProducts.map(p => p._id)
    const userProducts = await UserProduct.find({
      productId: { $in: productIds }
    }).populate<{
      userId: { email?: string; name?: string }
      productId: { code?: string; name?: string }
    }>([
      { path: 'userId', select: 'email name' },
      { path: 'productId', select: 'code name' }
    ])

    logger.success(`UserProducts CursEduca: ${userProducts.length}`)

    // Distribuição Primary/Secondary
    const primaryCount = await UserProduct.countDocuments({
      productId: { $in: productIds },
      isPrimary: true
    })

    const secondaryCount = await UserProduct.countDocuments({
      productId: { $in: productIds },
      isPrimary: false
    })

    logger.log('')
    logger.log('📊 DISTRIBUIÇÃO PRIMARY/SECONDARY:')
    logger.log(`   ✅ Primary: ${primaryCount}`)
    logger.log(`   🔻 Secondary: ${secondaryCount}`)

    // Verificar UserProducts sem isPrimary
    const withoutFlag = await UserProduct.countDocuments({
      productId: { $in: productIds },
      isPrimary: { $exists: false }
    })

    if (withoutFlag > 0) {
      logger.warn(`⚠️ ${withoutFlag} UserProducts SEM flag isPrimary!`)
    }

    // Mostrar sample
    logger.log('')
    logger.log('📦 SAMPLE DE USERPRODUCTS CRIADOS:')
    const sample = userProducts.slice(0, sampleSize)
    
    for (const up of sample) {
      const user = up.userId
      const product = up.productId
      
      logger.log(`   ${user?.email || 'N/A'}`)
      logger.log(`      → Produto: ${product?.code || 'N/A'}`)
      logger.log(`      → Status: ${up.status}`)
      logger.log(`      → isPrimary: ${up.isPrimary}`)
      logger.log(`      → Criado: ${up.createdAt}`)
      logger.log('')
    }

    // Estatísticas por produto
    logger.log('📊 ESTATÍSTICAS POR PRODUTO:')
    for (const product of curseducaProducts) {
      const count = await UserProduct.countDocuments({ productId: product._id })
      logger.log(`   ${product.code}: ${count} UserProducts`)
    }

    // Verificar inconsistências
    logger.log('')
    logger.log('🔍 VERIFICAÇÃO DE INCONSISTÊNCIAS:')
    
    const usersWithCurseduca = await User.countDocuments({
      'curseduca.curseducaUserId': { $exists: true, $ne: null }
    })
    
    logger.info(`Users com dados CursEduca: ${usersWithCurseduca}`)
    logger.info(`UserProducts CursEduca: ${userProducts.length}`)
    
    if (usersWithCurseduca > userProducts.length) {
      const missing = usersWithCurseduca - userProducts.length
      logger.warn(`${missing} users com dados CursEduca MAS sem UserProduct!`)
    } else {
      logger.success('✅ Todos os users com dados CursEduca têm UserProducts!')
    }

  } catch (error: unknown) {
    logger.error(`Erro na validação: ${errorMessage(error)}`)
  }
}

// ═══════════════════════════════════════════════════════════
// V2 ENDPOINTS - PRODUTOS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/curseduca/v2/products
 * Lista todos os produtos CursEduca
 */
export const getCurseducaProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'curseduca' })
      .select('name code curseducaGroupId curseducaGroupUuid isActive')
      .lean()

    res.json({
      success: true,
      data: products,
      count: products.length,
      _v2Enabled: true
    })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}

/**
 * GET /api/curseduca/v2/products/:groupId
 * Buscar produto por groupId
 */
export const getCurseducaProductByGroupId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params

    const product = await Product.findOne({
      platform: 'curseduca',
      $or: [
        { curseducaGroupId: groupId },
        { curseducaGroupUuid: groupId }
      ]
    }).lean()

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    const userCount = await getUserCountForProduct(String(product._id))

    res.json({
      success: true,
      data: { ...product, userCount },
      _v2Enabled: true
    })
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}

/**
 * GET /api/curseduca/v2/products/:groupId/users?minProgress=XX
 * Buscar users de um produto com filtro de progresso
 */
export const getCurseducaProductUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params
    const minProgress = typeof req.query.minProgress === 'string' ? req.query.minProgress : undefined

    const product = await Product.findOne({
      platform: 'curseduca',
      $or: [
        { curseducaGroupId: groupId },
        { curseducaGroupUuid: groupId }
      ]
    })

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    let users: ProductUserView[] = await getUsersByProductService(String(product._id))

    if (minProgress) {
      const minProg = parseInt(minProgress, 10)
      users = users.filter(user =>
        user.products?.some(productView => {
          const sameProduct = String(productView.product?._id) === String(product._id)
          const prog = productView.progress?.percentage || 0
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
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error) })
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
      products.map(async product => {
        const users: ProductUserView[] = await getUsersByProductService(String(product._id))

        const avgProgress =
          users.length > 0
            ? users.reduce((sum, user) => {
                const productData = user.products?.find(
                  productView => String(productView.product?._id) === String(product._id)
                )
                const prog = productData?.progress?.percentage || 0
                return sum + prog
              }, 0) / users.length
            : 0

        return {
          productId: product._id,
          productName: product.name,
          groupId: product.curseducaGroupId || product.curseducaGroupUuid,
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
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error) })
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/curseduca/users/classes
 * Buscar users com turmas
 */
export const getUsersWithClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({
      'curseduca.curseducaUserId': { $exists: true }
    })
      .select('name email curseduca.enrolledClasses curseduca.groupName')
      .lean()

    const stats = {
      total: users.length,
      withSingleClass: users.filter(user => user.curseduca?.enrolledClasses?.length === 1).length,
      withMultipleClasses: users.filter(user => (user.curseduca?.enrolledClasses?.length || 0) > 1).length,
      withoutClasses: users.filter(user => !user.curseduca?.enrolledClasses?.length).length
    }

    res.json({ success: true, users, stats })
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}

/**
 * PATCH /api/curseduca/users/:userId/classes
 * Atualizar turmas de um user
 */
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
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}

/**
 * GET /api/curseduca/sync/compare
 * Comparar sync history
 */
export const compareSyncMethods = async (req: Request, res: Response): Promise<void> => {
  try {
    const SyncReport = (await import('../../models/SyncModels/SyncReport')).default

    const legacyHistory = await SyncHistory.find({
      $or: [
        { type: 'curseduca' },
        { syncType: 'CURSEDUCA' },
        { type: 'CURSEDUCA' }
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
            legacyHistory.reduce((sum, history) => {
              const duration =
                history.completedAt && history.startedAt
                  ? (new Date(history.completedAt).getTime() - new Date(history.startedAt).getTime()) / 1000
                  : 0
              return sum + duration
            }, 0) / (legacyHistory.length || 1),

          avgDurationUniversal:
            universalReports.reduce((sum, report) => sum + (report.duration || 0), 0) /
            (universalReports.length || 1)
        }
      }
    })
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}

// ═══════════════════════════════════════════════════════════
// ENDPOINTS DEPRECADOS (501)
// ═══════════════════════════════════════════════════════════

export const getGroups = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use POST /api/curseduca/sync'
  })
}

export const getMembers = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use POST /api/curseduca/sync'
  })
}

export const getMemberByEmail = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use POST /api/curseduca/sync/email/:email'
  })
}

export const getAccessReports = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/curseduca/dashboard'
  })
}

export const getCurseducaUsers = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/users?source=CURSEDUCA'
  })
}

export const debugCurseducaAPI = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/curseduca/health (se disponível)'
  })
}


export const getSyncReport = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/sync/reports/:reportId'
  })
}

export const getUserByEmail = async (req: Request, res: Response): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Endpoint deprecado',
    note: 'Use GET /api/users?email=:email'
  })
}

export const cleanupDuplicates = async (
  _input: CurseducaCleanupInput,
  res: Response,
): Promise<void> => {
  res.status(501).json({
    success: false,
    message: 'Funcionalidade não implementada',
    note: 'Deduplicação é feita automaticamente no sync'
  })
}

// ✅ Alias para compatibilidade
export const syncCurseducaUsersUniversal = syncCurseducaUsers

// ═══════════════════════════════════════════════════════════════
// 🔄 SYNC EM BACKGROUND (evita timeout/CORS no proxy)
//
// O sync universal pode demorar minutos (enrich de centenas de
// membros via /members/{id}). Em vez de bloquear o request HTTP
// (que estoura o timeout do proxy → CORS), inicia em fundo e
// devolve 202 imediatamente. O frontend faz polling de /sync/status.
//
// Reutiliza 100% o handler existente syncCurseducaUsers via um
// "res" falso que captura o resultado. O endpoint síncrono
// /sync/universal continua intacto para cron e outros callers.
// ═══════════════════════════════════════════════════════════════

/**
 * GET /curseduca/sync/universal/start
 * Inicia o sync universal em background. Devolve 202 imediatamente.
 */
export const syncCurseducaUsersStart = async (req: Request, res: Response): Promise<void> => {
  if (global.__curseducaSyncRunning) {
    res.status(409).json({
      success: false,
      running: true,
      startedAt: global.__curseducaSyncStartedAt || null,
      message: 'Já existe um sync CursEduca em curso. Aguarde a conclusão.'
    })
    return
  }

  // Marcar como em execução
  global.__curseducaSyncRunning = true
  global.__curseducaSyncStartedAt = new Date()
  global.__curseducaSyncFinishedAt = null
  global.__curseducaSyncResult = null
  global.__curseducaSyncError = null

  // Responder JÁ (não bloquear → sem timeout)
  res.status(202).json({
    success: true,
    started: true,
    startedAt: global.__curseducaSyncStartedAt,
    message: 'Sincronização CursEduca iniciada em background. Use /curseduca/sync/status para acompanhar.'
  })

  // Correr em fundo reutilizando o handler existente com um res falso
  const fakeRes: SyncResponse & { statusCode: number } = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this },
    json(payload: Record<string, unknown>) {
      global.__curseducaSyncResult = { httpStatus: this.statusCode, ...payload }
      return this
    }
  }

  // fire-and-forget — o processo Railway mantém o event loop vivo
  Promise.resolve()
    .then(() => syncCurseducaUsers(req, fakeRes))
    .catch((error: unknown) => { global.__curseducaSyncError = errorMessage(error) })
    .finally(() => {
      global.__curseducaSyncRunning = false
      global.__curseducaSyncFinishedAt = new Date()
      const startedAt = global.__curseducaSyncStartedAt
      const dur = startedAt
        ? Math.round((global.__curseducaSyncFinishedAt.getTime() - startedAt.getTime()) / 1000)
        : 0
      console.log(`✅ [CursEduca BG] Sync background concluído em ${dur}s`)
    })
}

/**
 * GET /curseduca/sync/status
 * Estado do sync background (para polling do frontend).
 */
export const getCurseducaSyncStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    running: Boolean(global.__curseducaSyncRunning),
    startedAt: global.__curseducaSyncStartedAt || null,
    finishedAt: global.__curseducaSyncFinishedAt || null,
    error: global.__curseducaSyncError || null,
    result: global.__curseducaSyncResult || null
  })
}
