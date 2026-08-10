import { NextFunction, Request } from 'express'
import type { CrossReferenceResult } from '../../../services/guru/crossReference.service'
import type { SyncError, SyncProgress, SyncWarning } from '../../../types/universalSync.types'
import User from '../../../models/user'
import Product from '../../../models/product/Product'
import { UserProduct } from '../../../models'
import universalSyncService from '../../../services/syncUtilizadoresServices/universalSync'
import { getOptionalCurseducaRuntimeSettings } from '../../../services/requestDrivenRuntimeConfig'
import curseducaAdapter from '../../../services/syncUtilizadoresServices/curseducaServices/curseduca.adapter'
import { internalError } from '../../../security/errorHandling'
import { SyncLogger, errorMessage, errorStack, type SyncResponse } from './support'

export const syncCurseducaUsers = async (req: Request, res: SyncResponse, next: NextFunction): Promise<void> => {
  const logger = new SyncLogger()
  
  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 0: VALIDAR CREDENCIAIS
    // ═══════════════════════════════════════════════════════════
    
    logger.section('STEP 0: VALIDAR CREDENCIAIS')
    
    const curseducaSettings = getOptionalCurseducaRuntimeSettings()
    if (!curseducaSettings) {
      logger.error('Credenciais não configuradas!')
      
      res.status(400).json({
        success: false,
        message: 'Credenciais CursEduca não configuradas no arranque',
        missingVars: [
          'CURSEDUCA_API_URL',
          'CURSEDUCA_AccessToken',
          'CURSEDUCA_API_KEY'
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
        '../../../services/guru/crossReference.service'
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
      const dualRead = await import('../../../services/syncUtilizadoresServices/dualReadService').catch(() => null)
      if (dualRead?.clearUnifiedCache) {
        dualRead.clearUnifiedCache()
        logger.success('Cache invalidado')
      }

      const builder = await import('../../../services/dashboardStatsBuilder.service').catch(() => null)
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
    
    next(internalError('Erro ao executar sincronização CursEduca', 'CURSEDUCA_SYNC_FAILED', error))
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
