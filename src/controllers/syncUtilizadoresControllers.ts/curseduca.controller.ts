// src/controllers/curseduca.controller.ts 
import { Request, Response } from 'express'
import User from '../../models/user'
import Product from '../../models/product/Product'
import {
  getUsersByProduct as getUsersByProductService,
  getUserCountForProduct
} from '../../services/userProducts/userProductService'
import { SyncHistory, UserProduct } from '../../models'
import universalSyncService from '../../services/syncUtilziadoresServices/universalSyncService'
import fs from 'fs';
import path from 'path'
import curseducaAdapter from '../../services/syncUtilziadoresServices/curseducaServices/curseduca.adapter'


// ─────────────────────────────────────────────────────────────
// Tipos auxiliares (para calar TS sem mexer nos services)
// ─────────────────────────────────────────────────────────────
class SyncLogger {
  private logFile: string
  private startTime: number

  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.logFile = path.join(process.cwd(), 'logs', `curseduca-sync-${timestamp}.log`)
    this.startTime = Date.now()
    
    // Criar diretório de logs se não existir
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
// 📊 DASHBOARD STATS
// ─────────────────────────────────────────────────────────────

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getCurseducaDashboardStats()
    
    res.status(200).json({
      success: true,
      message: 'Dashboard carregado com sucesso',
      ...stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Erro interno: ${error.message}`,
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
      'curseduca.email': { $exists: true }
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
  } catch (error: any) {
    console.error('❌ Erro ao calcular estatísticas:', error.message)
    throw error
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
        { 'curseducaGroupId': groupId },
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
        { 'curseducaGroupId': groupId },
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
            product.curseducaGroupId ||
          product.curseducaGroupUuid,
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


/**
 * GET /api/curseduca/sync/universal
 * Sincronização CursEduca usando Universal Sync Service
 * ✅ Adapter com deduplicação e platformData.isPrimary/isDuplicate
 */
export const syncCurseducaUsersUniversal = async (req: Request, res: Response): Promise<void> => {
  const logger = new SyncLogger()
  
  try {
    logger.section('STEP 1: BUSCAR DADOS VIA ADAPTER')
    if (!process.env.CURSEDUCA_API_URL || !process.env.CURSEDUCA_AccessToken || !process.env.CURSEDUCA_API_KEY) {
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
    const { groupId } = req.query
    logger.info(`GroupId filter: ${groupId || 'TODOS'}`)

    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      groupId: groupId as string | undefined,
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
      logger.log(`      isPrimary: ${member.platformData?.isPrimary}`)
      logger.log('')
    })

    // ═══════════════════════════════════════════════════════════
    // STEP 2: EXECUTAR UNIVERSAL SYNC
    // ═══════════════════════════════════════════════════════════
    
    logger.section('STEP 2: EXECUTAR UNIVERSAL SYNC')

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'CursEduca Universal Sync (Manual via API)',
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),

      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,

      sourceData: curseducaData,

      onProgress: (progress: any) => {
        if (progress.current % 50 === 0 || progress.percentage === 100) {
          logger.info(`Progresso: ${progress.percentage.toFixed(1)}% (${progress.current}/${progress.total})`)
        }
      },

      onError: (error: any) => {
        logger.error(`Erro: ${error.message}`)
      },

      onWarning: (warning: any) => {
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
    // STEP 4: REBUILD STATS
    // ═══════════════════════════════════════════════════════════
    
    logger.section('STEP 4: REBUILD DASHBOARD STATS')
    
    try {
      const dualRead = await import('../../services/syncUtilziadoresServices/dualReadService').catch(() => null as any)
      if (dualRead?.clearUnifiedCache) {
        dualRead.clearUnifiedCache()
        logger.success('Cache invalidado')
      }

      const builder = await import('../../services/dashboardStatsBuilder.service').catch(() => null as any)
      if (builder?.buildDashboardStats) {
        await builder.buildDashboardStats()
        logger.success('Stats reconstruídos')
      }
    } catch (e: any) {
      logger.warn(`Falha ao rebuild stats (ignorado): ${e?.message}`)
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
        ? 'Sincronização via Universal Service concluída com sucesso!'
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
        syncHistoryUrl: `/api/sync/history/${result.syncHistoryId}`
      },
      _universalSync: true,
      _version: '3.0'
    })
  } catch (error: any) {
    logger.error(`Erro fatal: ${error.message}`)
    logger.log(error.stack || '')
    
    res.status(500).json({
      success: false,
      message: 'Erro ao executar sincronização via Universal Service',
      error: error.message,
      logFile: logger.getLogPath(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}
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
    }).populate('userId', 'email name').populate('productId', 'code name')

    logger.success(`UserProducts CursEduca: ${userProducts.length}`) 
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

// Verificar duplicados sem isPrimary definido
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
      const user = up.userId as any
      const product = up.productId as any
      
      logger.log(`   ${user?.email || 'N/A'}`)
      logger.log(`      → Produto: ${product?.code || 'N/A'}`)
      logger.log(`      → Status: ${up.status}`)
      logger.log(`      → Criado: ${up.createdAt}`)
      logger.log('')
    }

    // Estatísticas por produto
    logger.log('📊 ESTATÍSTICAS POR PRODUTO:')
    for (const product of curseducaProducts) {
      const count = await UserProduct.countDocuments({ productId: product._id })
      logger.log(`   ${product.code}: ${count} UserProducts`)
    }

    // Verificar users com dados CursEduca mas SEM UserProduct
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
      
      // Mostrar alguns exemplos
      const usersWithoutUP = await User.find({
        'curseduca.curseducaUserId': { $exists: true, $ne: null }
      }).select('email curseduca').limit(5)
      
      logger.log('')
      logger.log('📋 EXEMPLOS DE USERS SEM USERPRODUCT:')
      for (const user of usersWithoutUP) {
        const hasUP = await UserProduct.exists({ userId: user._id, productId: { $in: productIds } })
        if (!hasUP) {
          logger.log(`   ${user.email}`)
          logger.log(`      curseducaUserId: ${(user as any).curseduca?.curseducaUserId}`)
          logger.log(`      groupId: ${(user as any).curseduca?.groupId || 'N/A'}`)
          logger.log('')
        }
      }
    } else {
      logger.success('✅ Todos os users com dados CursEduca têm UserProducts!')
    }

  } catch (error: any) {
    logger.error(`Erro na validação: ${error.message}`)
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
