// ════════════════════════════════════════════════════════════
// 📁 src/services/sync/dailyPipeline.service.ts
// DAILY PIPELINE ORCHESTRATOR
// ════════════════════════════════════════════════════════════
//
// Coordena execução sequencial de todo o pipeline diário:
// 1. Sync Hotmart (colhe dados OGI)
// 2. Sync CursEduca (colhe dados CLAREZA)
// 3. Recalc Engagement (processa metrics com dados frescos)
// 4. Evaluate Tag Rules (aplica tags com dados completos)
//
// EXECUTADO:
// - CRON diário (02:00)
// - Manual via API: POST /api/cron/execute-pipeline
//
// ════════════════════════════════════════════════════════════

import { Product, UserProduct } from '../../models'
import logger from '../../utils/logger'

import { recalculateAllEngagementMetrics } from '../ac/recalculate-engagement-metrics'
import { tagOrchestratorV2 } from '../ac/tagOrchestrator.service'
import { syncCurseducaFull } from './curseducaServices/curseducaSync.service'
import { syncHotmartFull } from './hotmartServices/hotmartSync.service'


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
 * Obter configuração dos produtos para sync
 * 
 * IMPORTANTE: Adicionar/remover produtos aqui conforme necessário
 * Ou buscar dinamicamente da BD
 */
async function getProductsConfig() {
  // OPÇÃO 1: Hard-coded (mais rápido, menos flexível)
  /*
  return {
    hotmart: {
      subdomain: 'ogi' // OGI_V1
    },
    curseduca: {
      groupIds: ['clareza-mensal', 'clareza-anual'] // CLAREZA_MENSAL + CLAREZA_ANUAL
    }
  }
  */
  
  // OPÇÃO 2: Dinâmico da BD (mais flexível, recomendado)
  const hotmartProducts = await Product.find({ 
    platform: 'hotmart', 
    isActive: true 
  }).select('platformData.subdomain').lean()
  
  const curseducaProducts = await Product.find({ 
    platform: 'curseduca', 
    isActive: true 
  }).select('platformData.groupId').lean()
  
  return {
    hotmart: {
      subdomains: hotmartProducts
        .map(p => p.platformData?.subdomain)
        .filter(Boolean)
    },
    curseduca: {
      groupIds: curseducaProducts
        .map(p => p.platformData?.groupId)
        .filter(Boolean)
    }
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════

/**
 * Executa pipeline diário completo de forma sequencial
 * 
 * ORDEM:
 * 1. Sync Hotmart → Colhe dados OGI
 * 2. Sync CursEduca → Colhe dados CLAREZA
 * 3. Recalc Engagement → Processa metrics com dados frescos
 * 4. Evaluate Tag Rules → Aplica tags com dados completos
 * 
 * GARANTIAS:
 * - Execução sequencial (cada step espera anterior)
 * - Dados sempre frescos (recalc usa dados do sync)
 * - Logging completo (rastreabilidade)
 * - Error handling robusto (continua mesmo com erros)
 */
export async function executeDailyPipeline(): Promise<PipelineResult> {
  const startTime = Date.now()
  const errors: string[] = []
  
  logger.info('═'.repeat(60))
  logger.info('[PIPELINE] 🚀 INICIANDO PIPELINE DIÁRIO COMPLETO')
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
    // Obter configuração de produtos
    const config = await getProductsConfig()
    
    // ═══════════════════════════════════════════════════════════
    // STEP 1/4: SYNC HOTMART
    // ═══════════════════════════════════════════════════════════
    
    logger.info('')
    logger.info('[PIPELINE] 📥 STEP 1/4: Sync Hotmart')
    logger.info('-'.repeat(60))
    const step1Start = Date.now()
    
    try {
      let hotmartResult: any = {
        success: true,
        stats: { total: 0, inserted: 0, updated: 0, errors: 0 }
      }
      
      // Sync cada subdomain Hotmart
      if (config.hotmart.subdomains && config.hotmart.subdomains.length > 0) {
        for (const subdomain of config.hotmart.subdomains) {
          logger.info(`[PIPELINE] Syncing Hotmart subdomain: ${subdomain}`)
          const subResult = await syncHotmartFull(subdomain)
          
          // Agregar resultados
          hotmartResult.stats.total += subResult.stats.total
          hotmartResult.stats.inserted += subResult.stats.inserted
          hotmartResult.stats.updated += subResult.stats.updated
          hotmartResult.stats.errors += subResult.stats.errors
          
          if (!subResult.success) {
            hotmartResult.success = false
          }
        }
      } else {
        logger.warn('[PIPELINE] ⚠️ Nenhum produto Hotmart ativo encontrado')
      }
      
      result.steps.syncHotmart = {
        success: hotmartResult.success,
        duration: Math.floor((Date.now() - step1Start) / 1000),
        stats: hotmartResult.stats
      }
      
      result.summary.totalUsers += hotmartResult.stats.total || 0
      
      logger.info(`[PIPELINE] ✅ STEP 1/4 completo em ${result.steps.syncHotmart.duration}s`, {
        users: hotmartResult.stats.total,
        updated: hotmartResult.stats.updated
      })
      
    } catch (error: any) {
      const errorMsg = `Sync Hotmart: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.syncHotmart.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 1/4 falhou', {
        error: error.message,
        stack: error.stack
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2/4: SYNC CURSEDUCA
    // ═══════════════════════════════════════════════════════════
    
    logger.info('')
    logger.info('[PIPELINE] 📥 STEP 2/4: Sync CursEduca')
    logger.info('-'.repeat(60))
    const step2Start = Date.now()
    
    try {
      let curseducaResult: any = {
        success: true,
        stats: { total: 0, inserted: 0, updated: 0, errors: 0 }
      }
      
      // Sync cada groupId CursEduca
      if (config.curseduca.groupIds && config.curseduca.groupIds.length > 0) {
        for (const groupId of config.curseduca.groupIds) {
          logger.info(`[PIPELINE] Syncing CursEduca groupId: ${groupId}`)
          const groupResult = await syncCurseducaFull(groupId)
          
          // Agregar resultados
          curseducaResult.stats.total += groupResult.stats.total
          curseducaResult.stats.inserted += groupResult.stats.inserted
          curseducaResult.stats.updated += groupResult.stats.updated
          curseducaResult.stats.errors += groupResult.stats.errors
          
          if (!groupResult.success) {
            curseducaResult.success = false
          }
        }
      } else {
        logger.warn('[PIPELINE] ⚠️ Nenhum produto CursEduca ativo encontrado')
      }
      
      result.steps.syncCursEduca = {
        success: curseducaResult.success,
        duration: Math.floor((Date.now() - step2Start) / 1000),
        stats: curseducaResult.stats
      }
      
      result.summary.totalUsers += curseducaResult.stats.total || 0
      
      logger.info(`[PIPELINE] ✅ STEP 2/4 completo em ${result.steps.syncCursEduca.duration}s`, {
        users: curseducaResult.stats.total,
        updated: curseducaResult.stats.updated
      })
      
    } catch (error: any) {
      const errorMsg = `Sync CursEduca: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.syncCursEduca.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 2/4 falhou', {
        error: error.message,
        stack: error.stack
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3/4: RECALC ENGAGEMENT (USA DADOS FRESCOS DO SYNC!)
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
      
      logger.info(`[PIPELINE] ✅ STEP 3/4 completo em ${result.steps.recalcEngagement.duration}s`, {
        total: recalcResult.stats.total,
        updated: recalcResult.stats.updated,
        skipped: recalcResult.stats.skipped
      })
      
    } catch (error: any) {
      const errorMsg = `Recalc Engagement: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.recalcEngagement.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 3/4 falhou', {
        error: error.message,
        stack: error.stack
      })
    }
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4/4: EVALUATE TAG RULES (USA ENGAGEMENT FRESCO!)
    // ═══════════════════════════════════════════════════════════
    
    logger.info('')
    logger.info('[PIPELINE] 🏷️ STEP 4/4: Evaluate Tag Rules')
    logger.info('-'.repeat(60))
    const step4Start = Date.now()
    
    try {
      // Buscar TODOS os UserProducts ativos
      const userProducts = await UserProduct.find({ status: 'ACTIVE' })
        .select('userId productId')
        .lean()
      
      logger.info(`[PIPELINE] Processando ${userProducts.length} UserProducts`)
      
      // Executar orquestração para cada UserProduct
      const items = userProducts.map(up => ({
        userId: up.userId.toString(),
        productId: up.productId.toString()
      }))
      
      const orchestrationResults = await tagOrchestratorV2.orchestrateMultipleUserProducts(items)
      
      // Agregar estatísticas
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
      
      logger.info(`[PIPELINE] ✅ STEP 4/4 completo em ${result.steps.evaluateTagRules.duration}s`, {
        userProducts: stats.total,
        successful: stats.successful,
        tagsApplied
      })
      
    } catch (error: any) {
      const errorMsg = `Tag Rules: ${error.message}`
      errors.push(errorMsg)
      result.success = false
      result.steps.evaluateTagRules.error = error.message
      
      logger.error('[PIPELINE] ❌ STEP 4/4 falhou', {
        error: error.message,
        stack: error.stack
      })
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
      duration: `${result.duration}s (${Math.floor(result.duration / 60)}min ${result.duration % 60}s)`,
      steps: {
        hotmart: `${result.steps.syncHotmart.duration}s`,
        curseduca: `${result.steps.syncCursEduca.duration}s`,
        engagement: `${result.steps.recalcEngagement.duration}s`,
        tagRules: `${result.steps.evaluateTagRules.duration}s`
      },
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
    logger.error('[PIPELINE] Erro:', {
      message: error.message,
      stack: error.stack
    })
    
    return result
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  executeDailyPipeline
}