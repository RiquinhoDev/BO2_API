// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/dailyPipeline.service.ts
// DAILY PIPELINE ORCHESTRATOR (100% UNIVERSAL SYNC)
// ════════════════════════════════════════════════════════════

import { Product, UserProduct } from '../../models'
import logger from '../../utils/logger'

import { recalculateAllEngagementMetrics } from '../ac/recalculate-engagement-metrics'
import { tagOrchestratorV2 } from '../ac/tagOrchestrator.service'

// ✅ Adapters + Universal Sync
import universalSyncService from './universalSyncService'
import curseducaAdapter from './curseducaServices/curseduca.adapter'
import hotmartAdapter from './hotmartServices/hotmart.adapter'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface StepResult {
  success: boolean
  duration: number
  stats: any
  error?: string
}

interface PipelineResult {
  success: boolean
  duration: number
  completedAt: Date
  steps: {
    syncHotmart: StepResult
    syncCursEduca: StepResult
    recalcEngagement: StepResult
    evaluateTagRules: StepResult
  }
  errors: string[]
  summary: {
    totalUsers: number
    totalUserProducts: number
    engagementUpdated: number
    tagsApplied: number
  }
}

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

/**
 * Obter configuração dos produtos para sync (DINÂMICO DA BD)
 */
async function getProductsConfig() {
  const hotmartProducts = await Product.find({ 
    platform: 'hotmart', 
    isActive: true 
  }).select('code platformData').lean()
  
  const curseducaProducts = await Product.find({ 
    platform: 'curseduca', 
    isActive: true 
  }).select('code platformData').lean()
  
  return {
    hotmart: {
      products: hotmartProducts
    },
    curseduca: {
      products: curseducaProducts
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════

/**
 * Executa pipeline diário completo usando Universal Sync
 */
export async function executeDailyPipeline(): Promise<PipelineResult> {
  const startTime = Date.now()
  const errors: string[] = []
  
  logger.info('═'.repeat(60))
  logger.info('[PIPELINE] 🚀 INICIANDO PIPELINE DIÁRIO (UNIVERSAL SYNC)')
  logger.info('═'.repeat(60))
  
  const result: PipelineResult = {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      syncHotmart: { success: false, duration: 0, stats: {} },
      syncCursEduca: { success: false, duration: 0, stats: {} },
      recalcEngagement: { success: false, duration: 0, stats: {} },
      evaluateTagRules: { success: false, duration: 0, stats: {} }
    },
    errors: [],
    summary: {
      totalUsers: 0,
      totalUserProducts: 0,
      engagementUpdated: 0,
      tagsApplied: 0
    }
  }
  
  try {
    const config = await getProductsConfig()
    
    // ═══════════════════════════════════════════════════════════
    // STEP 1/4: SYNC HOTMART (UNIVERSAL SYNC)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('')
    logger.info('[PIPELINE] 📥 STEP 1/4: Sync Hotmart (Universal)')
    logger.info('-'.repeat(60))
    const step1Start = Date.now()
    
    try {
      let totalStats = { total: 0, inserted: 0, updated: 0, errors: 0 }
      
      if (config.hotmart.products.length > 0) {
        // Sync cada produto Hotmart
        for (const product of config.hotmart.products) {
          const subdomain = product.platformData?.subdomain || product.code
          
          logger.info(`[PIPELINE] Syncing Hotmart: ${product.code} (${subdomain})`)
          
          // 1. Buscar dados via adapter
          const hotmartData = await hotmartAdapter.fetchHotmartDataForSync()
          
          if (hotmartData.length === 0) {
            logger.warn(`[PIPELINE] ⚠️ Nenhum user encontrado para ${product.code}`)
            continue
          }
          
          // 2. Executar Universal Sync
          const syncResult = await universalSyncService.executeUniversalSync({
            syncType: 'hotmart',
            jobName: `Daily Pipeline - Hotmart ${product.code}`,
            triggeredBy: 'CRON',
            fullSync: true,
            includeProgress: true,
            includeTags: false,
            batchSize: 50,
            sourceData: hotmartData
          })
          
          // Agregar stats
          totalStats.total += syncResult.stats.total
          totalStats.inserted += syncResult.stats.inserted
          totalStats.updated += syncResult.stats.updated
          totalStats.errors += syncResult.stats.errors
          
          logger.info(`[PIPELINE]    ✅ ${syncResult.stats.total} users processados`)
        }
      } else {
        logger.warn('[PIPELINE] ⚠️ Nenhum produto Hotmart ativo')
      }
      
      result.steps.syncHotmart = {
        success: totalStats.errors === 0,
        duration: Math.floor((Date.now() - step1Start) / 1000),
        stats: totalStats
      }
      
      result.summary.totalUsers += totalStats.total
      
      logger.info(`[PIPELINE] ✅ STEP 1/4 completo em ${result.steps.syncHotmart.duration}s`)
      
    } catch (error: any) {
      const errorMsg = `Sync Hotmart: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.syncHotmart.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 1/4 falhou:', error.message)
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2/4: SYNC CURSEDUCA (UNIVERSAL SYNC)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('')
    logger.info('[PIPELINE] 📥 STEP 2/4: Sync CursEduca (Universal)')
    logger.info('-'.repeat(60))
    const step2Start = Date.now()
    
    try {
      let totalStats = { total: 0, inserted: 0, updated: 0, errors: 0 }
      
      if (config.curseduca.products.length > 0) {
        // Buscar TODOS os dados CursEduca de uma vez (adapter já filtra por grupos)
        logger.info(`[PIPELINE] Syncing CursEduca (todos os grupos)`)
        
        // 1. Buscar dados via adapter (sem groupId = TODOS os grupos)
        const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
          includeProgress: true,
          includeGroups: true,
          enrichWithDetails: true
        })
        
        if (curseducaData.length === 0) {
          logger.warn(`[PIPELINE] ⚠️ Nenhum user encontrado na CursEduca`)
        } else {
          // 2. Executar Universal Sync
          const syncResult = await universalSyncService.executeUniversalSync({
            syncType: 'curseduca',
            jobName: `Daily Pipeline - CursEduca`,
            triggeredBy: 'CRON',
            fullSync: true,
            includeProgress: true,
            includeTags: false,
            batchSize: 50,
            sourceData: curseducaData
          })
          
          totalStats = syncResult.stats
          
          logger.info(`[PIPELINE]    ✅ ${syncResult.stats.total} users processados`)
        }
      } else {
        logger.warn('[PIPELINE] ⚠️ Nenhum produto CursEduca ativo')
      }
      
      result.steps.syncCursEduca = {
        success: totalStats.errors === 0,
        duration: Math.floor((Date.now() - step2Start) / 1000),
        stats: totalStats
      }
      
      result.summary.totalUsers += totalStats.total
      
      logger.info(`[PIPELINE] ✅ STEP 2/4 completo em ${result.steps.syncCursEduca.duration}s`)
      
    } catch (error: any) {
      const errorMsg = `Sync CursEduca: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.syncCursEduca.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 2/4 falhou:', error.message)
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3/4: RECALC ENGAGEMENT
    // ═══════════════════════════════════════════════════════════
    
    logger.info('')
    logger.info('[PIPELINE] 🔄 STEP 3/4: Recalc Engagement')
    logger.info('-'.repeat(60))
    const step3Start = Date.now()
    
    try {
      const recalcResult = await recalculateAllEngagementMetrics()
      
      result.steps.recalcEngagement = {
        success: recalcResult.success,
        duration: Math.floor((Date.now() - step3Start) / 1000),
        stats: recalcResult.stats
      }
      
      result.summary.totalUserProducts = recalcResult.stats.total || 0
      result.summary.engagementUpdated = recalcResult.stats.updated || 0
      
      logger.info(`[PIPELINE] ✅ STEP 3/4 completo em ${result.steps.recalcEngagement.duration}s`)
      
    } catch (error: any) {
      const errorMsg = `Recalc Engagement: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.recalcEngagement.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 3/4 falhou:', error.message)
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4/4: EVALUATE TAG RULES
    // ═══════════════════════════════════════════════════════════
    
    logger.info('')
    logger.info('[PIPELINE] 🏷️ STEP 4/4: Evaluate Tag Rules')
    logger.info('-'.repeat(60))
    const step4Start = Date.now()
    
    try {
      const userProducts = await UserProduct.find({ status: 'ACTIVE' })
        .select('userId productId')
        .lean()
      
      logger.info(`[PIPELINE] Processando ${userProducts.length} UserProducts`)
      
      const items = userProducts.map(up => ({
        userId: up.userId.toString(),
        productId: up.productId.toString()
      }))
      
      const orchestrationResults = await tagOrchestratorV2.orchestrateMultipleUserProducts(items)
      
      const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)
      
      const tagsApplied = orchestrationResults.reduce(
        (sum, r) => sum + (r.tagsApplied?.length || 0), 
        0
      )
      
      result.steps.evaluateTagRules = {
        success: stats.failed === 0,
        duration: Math.floor((Date.now() - step4Start) / 1000),
        stats: {
          total: stats.total,
          successful: stats.successful,
          failed: stats.failed,
          tagsApplied,
          tagsRemoved: orchestrationResults.reduce(
            (sum, r) => sum + (r.tagsRemoved?.length || 0), 
            0
          )
        }
      }
      
      result.summary.tagsApplied = tagsApplied
      
      logger.info(`[PIPELINE] ✅ STEP 4/4 completo em ${result.steps.evaluateTagRules.duration}s`)
      
    } catch (error: any) {
      const errorMsg = `Tag Rules: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.evaluateTagRules.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 4/4 falhou:', error.message)
    }
    
    // ═══════════════════════════════════════════════════════════
    // FINALIZAR
    // ═══════════════════════════════════════════════════════════
    
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = errors
    
    logger.info('')
    logger.info('═'.repeat(60))
    
    if (result.success) {
      logger.info('[PIPELINE] 🎉 PIPELINE COMPLETO COM SUCESSO!')
    } else {
      logger.warn('[PIPELINE] ⚠️ PIPELINE COMPLETO COM ERROS')
    }
    
    logger.info('═'.repeat(60))
    logger.info('[PIPELINE] 📊 RESUMO:', {
      duration: `${result.duration}s`,
      summary: result.summary,
      errors: errors.length
    })
    
    if (errors.length > 0) {
      logger.error('[PIPELINE] ❌ ERROS:', errors)
    }
    
    logger.info('═'.repeat(60))
    
    return result
    
  } catch (error: any) {
    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors.push(`Pipeline fatal: ${error.message}`)
    
    logger.error('═'.repeat(60))
    logger.error('[PIPELINE] ❌ PIPELINE FALHOU COMPLETAMENTE')
    logger.error('═'.repeat(60))
    logger.error('[PIPELINE] Erro:', error.message)
    
    return result
  }
}

export default {
  executeDailyPipeline
}