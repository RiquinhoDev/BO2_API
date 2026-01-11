// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/dailyPipeline.service.ts
// DAILY PIPELINE ORCHESTRATOR (100% UNIVERSAL SYNC)
// ════════════════════════════════════════════════════════════

import { Product, UserProduct, PipelineExecution } from '../../models'
import logger from '../../utils/logger'

import { recalculateAllEngagementMetrics } from '../syncUtilziadoresServices/engagement/recalculate-engagement-metrics'

import tagPreCreationService from '../activeCampaign/tagPreCreation.service'

// ✅ Adapters + Universal Sync
import universalSyncService from '../syncUtilziadoresServices/universalSyncService'
import curseducaAdapter from '../syncUtilziadoresServices/curseducaServices/curseduca.adapter'
import hotmartAdapter from '../syncUtilziadoresServices/hotmartServices/hotmart.adapter'
import { DailyPipelineResult, PipelineStepResult } from '../../types/cron.types'
import tagOrchestratorV2 from '../activeCampaign/tagOrchestrator.service'

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
 * Helper para logging limpo (sem spam)
 */
function logStep(stepNum: number, stepName: string, status: 'START' | 'DONE' | 'ERROR', stats?: any) {
  const timestamp = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

  if (status === 'START') {
    logger.info(`[${timestamp}] STEP ${stepNum}/5: ${stepName}...`)
  } else if (status === 'DONE') {
    const statsStr = stats ? ` (${stats})` : ''
    logger.info(`[${timestamp}] STEP ${stepNum}/5: ${stepName} ✓${statsStr}`)
  } else {
    logger.error(`[${timestamp}] STEP ${stepNum}/5: ${stepName} ✗ ${stats}`)
  }
}

/**
 * Executa pipeline diário completo usando Universal Sync
 */
export async function executeDailyPipeline(): Promise<DailyPipelineResult> {
  const startTime = Date.now()
  const errors: string[] = []

  const startTimestamp = new Date().toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
  logger.info('━'.repeat(60))
  logger.info(`🚀 PIPELINE DIÁRIO - Início: ${startTimestamp}`)
  logger.info('━'.repeat(60))

  const result: DailyPipelineResult = {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      syncHotmart: { success: false, duration: 0, stats: {} },
      syncCursEduca: { success: false, duration: 0, stats: {} },
      preCreateTags: { success: false, duration: 0, stats: {} },
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

    // STEP 1/5: SYNC HOTMART
    const step1Start = Date.now()
    logStep(1, 'Sync Hotmart', 'START')

    try {
      let totalStats = { total: 0, inserted: 0, updated: 0, errors: 0 }
      const hotmartProductsCount = config.hotmart.products.length

      if (hotmartProductsCount > 0) {
        for (let idx = 0; idx < hotmartProductsCount; idx++) {
          const product = config.hotmart.products[idx] as any

          const hotmartData = await hotmartAdapter.fetchHotmartDataForSync()
          if (hotmartData.length === 0) continue

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

          totalStats.total += syncResult.stats.total
          totalStats.inserted += syncResult.stats.inserted
          totalStats.updated += syncResult.stats.updated
          totalStats.errors += syncResult.stats.errors
        }
      }

      result.steps.syncHotmart = {
        success: totalStats.errors === 0,
        duration: Math.floor((Date.now() - step1Start) / 1000),
        stats: totalStats
      }

      result.summary.totalUsers += totalStats.total

      logStep(1, 'Sync Hotmart', 'DONE', `${totalStats.total} users, ${result.steps.syncHotmart.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Sync Hotmart: ${message}`)

      result.success = false
      result.steps.syncHotmart = {
        ...(result.steps.syncHotmart as PipelineStepResult),
        success: false,
        error: message
      }

      logStep(1, 'Sync Hotmart', 'ERROR', message)
    }

    // STEP 2/5: SYNC CURSEDUCA
    const step2Start = Date.now()
    logStep(2, 'Sync CursEduca', 'START')

    try {
      let totalStats = { total: 0, inserted: 0, updated: 0, errors: 0 }

      if (config.curseduca.products.length > 0) {
        const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
          includeProgress: true,
          includeGroups: true,
          enrichWithDetails: true
        })

        if (curseducaData.length > 0) {
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
        }
      }

      result.steps.syncCursEduca = {
        success: totalStats.errors === 0,
        duration: Math.floor((Date.now() - step2Start) / 1000),
        stats: totalStats
      }

      result.summary.totalUsers += totalStats.total

      logStep(2, 'Sync CursEduca', 'DONE', `${totalStats.total} users, ${result.steps.syncCursEduca.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Sync CursEduca: ${message}`)

      result.success = false
      result.steps.syncCursEduca = {
        ...(result.steps.syncCursEduca as PipelineStepResult),
        success: false,
        error: message
      }

      logStep(2, 'Sync CursEduca', 'ERROR', message)
    }

    // STEP 3/5: PRÉ-CRIAR TAGS BO
    logger.info('   ➡️  Transição Step 2 → Step 3...')
    const step3Start = Date.now()
    logStep(3, 'Pre-create Tags', 'START')

    try {
      logger.info('   📦 Chamando tagPreCreationService.preCreateBOTags()...')
      const preCreateResult = await tagPreCreationService.preCreateBOTags()

      result.steps.preCreateTags = {
        success: preCreateResult.success,
        duration: Math.floor((Date.now() - step3Start) / 1000),
        stats: {
          totalTags: preCreateResult.totalTags,
          created: preCreateResult.created,
          existing: preCreateResult.existing,
          cached: preCreateResult.tagCache.size,
          failed: preCreateResult.failed.length
        }
      }

      if (preCreateResult.failed.length > 0) {
        logger.warn(`⚠️  ${preCreateResult.failed.length} tags falharam: ${preCreateResult.failed.join(', ')}`)
      }

      logStep(3, 'Pre-create Tags', 'DONE', `${preCreateResult.totalTags} tags, ${result.steps.preCreateTags.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Pre-create Tags: ${message}`)

      result.success = false
      result.steps.preCreateTags = {
        ...(result.steps.preCreateTags as PipelineStepResult),
        success: false,
        error: message
      }

      logStep(3, 'Pre-create Tags', 'ERROR', message)
    }

    // STEP 4/5: RECALC ENGAGEMENT
    logger.info('   ➡️  Transição Step 3 → Step 4...')
    const step4Start = Date.now()
    logStep(4, 'Recalc Engagement', 'START')

    try {
      const recalcResult = await recalculateAllEngagementMetrics()

      result.steps.recalcEngagement = {
        success: recalcResult.success,
        duration: Math.floor((Date.now() - step4Start) / 1000),
        stats: recalcResult.stats
      }

      result.summary.totalUserProducts = (recalcResult.stats?.total as number) || 0
      result.summary.engagementUpdated = (recalcResult.stats?.updated as number) || 0

      const total = recalcResult.stats?.total || 0
      const updated = recalcResult.stats?.updated || 0
      logStep(4, 'Recalc Engagement', 'DONE', `${total} UserProducts, ${updated} atualizados, ${result.steps.recalcEngagement.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Recalc Engagement: ${message}`)

      result.success = false
      result.steps.recalcEngagement = {
        ...(result.steps.recalcEngagement as PipelineStepResult),
        success: false,
        error: message
      }

      logStep(4, 'Recalc Engagement', 'ERROR', message)
    }

    // STEP 5/5: EVALUATE TAG RULES
    logger.info('   ➡️  Transição Step 4 → Step 5...')
    const step5Start = Date.now()
    logStep(5, 'Tag Rules', 'START')

    try {
      // ═══════════════════════════════════════════════════════════
      // FILTRAR ALUNOS INATIVOS DO OGI_V1
      // Condições:
      // 1. Último acesso > 380 dias
      // 2. OU compra antes de 31/12/2024
      // ═══════════════════════════════════════════════════════════

      const cutoffDate = new Date('2024-12-31T23:59:59Z')
      const inactiveDaysThreshold = 380
      const cutoffActivityDate = new Date()
      cutoffActivityDate.setDate(cutoffActivityDate.getDate() - inactiveDaysThreshold)

      // Buscar produto OGI_V1
      const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).select('_id').lean() as { _id: any } | null
      const ogiProductId = ogiProduct?._id?.toString()

      // Produtos a IGNORAR (não têm regras de tags)
      const PRODUCTS_TO_SKIP = ['DISCORD_COMMUNITY', 'DISCORD']
      const productsToSkip = await Product.find({
        code: { $in: PRODUCTS_TO_SKIP }
      }).select('_id').lean()
      const productIdsToSkip = new Set(productsToSkip.map((p: any) => p._id.toString()))
      logger.info(`   🚫 Produtos a ignorar: ${PRODUCTS_TO_SKIP.join(', ')}`)

      // Buscar TODOS os UserProducts ativos
      const userProducts = await UserProduct.find({ status: 'ACTIVE' })
        .select('userId productId metadata engagement')
        .populate({ path: 'userId', select: 'hotmart.lastAccessDate hotmart.firstAccessDate hotmart.progress.lastAccessDate metadata.purchaseDate email' })
        .populate({ path: 'productId', select: 'code' })
        .lean<any[]>()

      logger.info(`   📊 Total UserProducts ativos: ${userProducts.length}`)

      // Filtrar produtos sem regras de tags (DISCORD_COMMUNITY, etc)
      const userProductsWithTags = userProducts.filter((up) => {
        const productIdStr = up.productId?._id?.toString() || up.productId?.toString()
        if (productIdsToSkip.has(productIdStr)) return false
        return true
      })
      const skippedCount = userProducts.length - userProductsWithTags.length
      if (skippedCount > 0) {
        logger.info(`   🚫 ${skippedCount} UserProducts de produtos sem tags ignorados`)
      }

      // Filtrar UserProducts órfãos (userId null)
      const validUserProducts = userProductsWithTags.filter((up) => up.userId && up.userId._id)
      const orphanCount = userProductsWithTags.length - validUserProducts.length
      if (orphanCount > 0) {
        logger.warn(`   ⚠️  ${orphanCount} UserProducts órfãos ignorados`)
      }

      // Filtrar OGI_V1 inativos
      const filteredUserProducts = validUserProducts.filter((up) => {
        const productId = up.productId?._id?.toString() || up.productId?.toString()

        // Se não é OGI_V1, incluir sempre
        if (!ogiProductId || productId !== ogiProductId) {
          return true
        }

        // É OGI_V1 → aplicar filtros
        const user = up.userId

        // Fallback para lastAccessDate (múltiplas fontes)
        const lastAccessDate =
          user?.hotmart?.lastAccessDate ||
          user?.hotmart?.progress?.lastAccessDate ||
          user?.hotmart?.firstAccessDate

        const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate

        // Filtro 1: Compra antes de 31/12/2024
        if (purchaseDate && new Date(purchaseDate) < cutoffDate) {
          return false // Ignorar
        }

        // Filtro 2: Último acesso > 380 dias (se tiver data)
        if (lastAccessDate && new Date(lastAccessDate) < cutoffActivityDate) {
          return false // Ignorar
        }

        // Se NÃO tem lastAccessDate → INCLUIR (assumir que é aluno recente)
        return true
      })

      const filteredCount = validUserProducts.length - filteredUserProducts.length
      if (filteredCount > 0) {
        logger.info(`   🔍 Filtrados ${filteredCount} alunos OGI_V1 inativos`)
      }

      // Mapear items para processamento
      const items = filteredUserProducts
        .filter(up => up.userId && up.userId._id)
        .map((up) => ({
          userId: up.userId._id?.toString() || up.userId.toString(),
          productId: up.productId?._id?.toString() || up.productId?.toString()
        }))

      // Processamento sequencial (evita race conditions no rate limiting)
      const orchestrationResults: any[] = []
      let lastLoggedPercent = 0
      let totalTagsApplied = 0
      let totalTagsRemoved = 0
      let totalErrors = 0

      logger.info(`   🚀 Iniciando Step 5: ${items.length} UserProducts a processar...`)

      for (const item of items) {
        const result = await tagOrchestratorV2.orchestrateUserProduct(item.userId, item.productId)
          .catch((error) => ({
            userId: item.userId,
            productId: item.productId,
            productCode: '',
            tagsApplied: [],
            tagsRemoved: [],
            communicationsTriggered: 0,
            success: false,
            error: error.message
          }))

        orchestrationResults.push(result)

        // Acumular stats
        totalTagsApplied += result.tagsApplied?.length || 0
        totalTagsRemoved += result.tagsRemoved?.length || 0
        if (!result.success) totalErrors++

        // Log a cada 5% de progresso (ou a cada 100 items se < 5%)
        const processed = orchestrationResults.length
        const percentage = Math.floor((processed / items.length) * 100)
        const shouldLog = percentage >= lastLoggedPercent + 5 ||
                         processed === items.length ||
                         (processed % 100 === 0 && items.length > 2000)

        if (shouldLog) {
          const elapsed = (Date.now() - step5Start) / 1000
          const avgTimePerItem = elapsed / processed
          const remaining = items.length - processed
          const etaSec = Math.floor(avgTimePerItem * remaining)
          const etaMin = Math.floor(etaSec / 60)
          const etaSecRemainder = etaSec % 60

          logger.info(`   📊 ${percentage}% (${processed}/${items.length}) | +${totalTagsApplied} -${totalTagsRemoved} tags | ${totalErrors} erros | ETA: ${etaMin}m${etaSecRemainder}s`)
          lastLoggedPercent = percentage
        }
      }

      logger.info(`   ✅ Processamento completo: ${items.length} UserProducts em ${Math.floor((Date.now() - step5Start) / 1000)}s`)

      const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)

      const tagsApplied = orchestrationResults.reduce(
        (sum: number, r: any) => sum + (r.tagsApplied?.length || 0),
        0
      )

      const tagsRemoved = orchestrationResults.reduce(
        (sum: number, r: any) => sum + (r.tagsRemoved?.length || 0),
        0
      )

      result.steps.evaluateTagRules = {
        success: stats.failed === 0,
        duration: Math.floor((Date.now() - step5Start) / 1000),
        stats: {
          total: stats.total,
          successful: stats.successful,
          failed: stats.failed,
          tagsApplied,
          tagsRemoved
        }
      }

      result.summary.tagsApplied = tagsApplied

      logStep(5, 'Tag Rules', 'DONE', `+${tagsApplied} tags, -${tagsRemoved} tags, ${result.steps.evaluateTagRules.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Tag Rules: ${message}`)

      result.success = false
      result.steps.evaluateTagRules = {
        success: false,
        duration: Math.floor((Date.now() - step5Start) / 1000),
        stats: {
          total: 0,
          successful: 0,
          failed: 1,
          tagsApplied: 0,
          tagsRemoved: 0
        },
        error: message
      }

      logStep(5, 'Tag Rules', 'ERROR', message)
    }

    // FINALIZAR
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = errors

    const durationMin = Math.floor(result.duration / 60)
    const durationSec = result.duration % 60
    const endTimestamp = new Date().toLocaleString('pt-PT', {
      dateStyle: 'short',
      timeStyle: 'short'
    })

    logger.info('━'.repeat(60))

    if (result.success) {
      logger.info('🎉 PIPELINE COMPLETO COM SUCESSO')
    } else {
      logger.warn('⚠️  PIPELINE COMPLETO COM ERROS')
    }

    logger.info(`Fim: ${endTimestamp} | Duração: ${durationMin}min ${durationSec}s`)
    logger.info('')
    logger.info('📊 RESUMO:')
    logger.info(`   STEP 1 - Hotmart:      ${result.steps.syncHotmart.duration}s | ${result.steps.syncHotmart.stats?.total || 0} users`)
    logger.info(`   STEP 2 - CursEduca:    ${result.steps.syncCursEduca.duration}s | ${result.steps.syncCursEduca.stats?.total || 0} users`)
    logger.info(`   STEP 3 - Pre-create:   ${result.steps.preCreateTags.duration}s | ${result.steps.preCreateTags.stats?.totalTags || 0} tags`)
    logger.info(`   STEP 4 - Engagement:   ${result.steps.recalcEngagement.duration}s | ${result.steps.recalcEngagement.stats?.updated || 0} atualizados`)
    logger.info(`   STEP 5 - Tag Rules:    ${result.steps.evaluateTagRules.duration}s | +${result.steps.evaluateTagRules.stats?.tagsApplied || 0}/-${result.steps.evaluateTagRules.stats?.tagsRemoved || 0} tags`)
    logger.info('')
    logger.info(`📈 Total: ${result.summary.totalUsers} users | ${result.summary.totalUserProducts} UserProducts | ${result.summary.tagsApplied} tags aplicadas`)

    if (errors.length > 0) {
      logger.info('')
      logger.error(`❌ ERROS (${errors.length}):`)
      errors.forEach((err, i) => logger.error(`   ${i + 1}. ${err}`))
    }

    logger.info('━'.repeat(60))

    // Salvar histórico de execução
    try {
      await PipelineExecution.create({
        executionType: 'automatic',
        status: result.success ? 'success' : (errors.length > 0 ? 'partial' : 'failed'),
        startTime: new Date(startTime),
        endTime: result.completedAt,
        duration: result.duration,
        steps: result.steps,
        summary: result.summary,
        errorMessages: result.errors,
        triggeredBy: 'CRON'
      })
      logger.info('💾 Histórico salvo')
    } catch (err: any) {
      logger.error(`❌ Erro ao salvar histórico: ${err.message}`)
    }

    return result
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)

    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = [...errors, `Pipeline fatal: ${message}`]

    logger.error('━'.repeat(60))
    logger.error('❌ PIPELINE FALHOU COMPLETAMENTE')
    logger.error(`Erro: ${message}`)
    logger.error('━'.repeat(60))

    return result
  }
}


// ═══════════════════════════════════════════════════════════
// TAG RULES ONLY (Steps 3, 4, 5 - sem sync)
// ═══════════════════════════════════════════════════════════

export interface TagRulesOnlyResult {
  success: boolean
  duration: number
  completedAt: Date
  steps: {
    preCreateTags: PipelineStepResult
    recalcEngagement: PipelineStepResult
    evaluateTagRules: PipelineStepResult
  }
  errors: string[]
  summary: {
    totalUserProducts: number
    engagementUpdated: number
    tagsApplied: number
    tagsRemoved: number
  }
}

/**
 * Executa APENAS os steps de tags (sem sync Hotmart/CursEduca)
 * Útil para aplicar tags rapidamente sem esperar pelo sync completo
 *
 * Steps executados:
 * - Step 3: Pre-create Tags BO (garante que tags existem na AC)
 * - Step 4: Recalc Engagement (atualiza métricas)
 * - Step 5: Evaluate Tag Rules (aplica/remove tags)
 */
export async function executeTagRulesOnly(): Promise<TagRulesOnlyResult> {
  console.log('[TAG-RULES] ▶️ Função iniciada!')

  const startTime = Date.now()
  const errors: string[] = []

  const startTimestamp = new Date().toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  })

  console.log('[TAG-RULES] ▶️ Timestamp:', startTimestamp)
  console.log('[TAG-RULES] ▶️ A criar objeto result...')

  const result: TagRulesOnlyResult = {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      preCreateTags: { success: false, duration: 0, stats: {} },
      recalcEngagement: { success: false, duration: 0, stats: {} },
      evaluateTagRules: { success: false, duration: 0, stats: {} }
    },
    errors: [],
    summary: {
      totalUserProducts: 0,
      engagementUpdated: 0,
      tagsApplied: 0,
      tagsRemoved: 0
    }
  }

  try {
    // STEP 1/3: PRÉ-CRIAR TAGS BO
    console.log('[TAG-RULES] ▶️ STEP 1/3: Pre-create Tags - INÍCIO')
    const step1Start = Date.now()

    try {
      console.log('[TAG-RULES] ▶️ A chamar tagPreCreationService.preCreateBOTags()...')
      const preCreateResult = await tagPreCreationService.preCreateBOTags()
      console.log('[TAG-RULES] ✅ preCreateBOTags() retornou!')

      result.steps.preCreateTags = {
        success: preCreateResult.success,
        duration: Math.floor((Date.now() - step1Start) / 1000),
        stats: {
          totalTags: preCreateResult.totalTags,
          created: preCreateResult.created,
          existing: preCreateResult.existing,
          cached: preCreateResult.tagCache.size,
          failed: preCreateResult.failed.length
        }
      }

      if (preCreateResult.failed.length > 0) {
        console.log(`[TAG-RULES] ⚠️ ${preCreateResult.failed.length} tags falharam: ${preCreateResult.failed.join(', ')}`)
      }

      console.log(`[TAG-RULES] ✅ STEP 1/3 DONE: ${preCreateResult.totalTags} tags, ${result.steps.preCreateTags.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Pre-create Tags: ${message}`)
      result.success = false
      result.steps.preCreateTags = {
        ...(result.steps.preCreateTags as PipelineStepResult),
        success: false,
        error: message
      }
      console.log(`[TAG-RULES] ❌ STEP 1/3 ERROR: ${message}`)
    }

    // STEP 2/3: RECALC ENGAGEMENT
    console.log('[TAG-RULES] ▶️ STEP 2/3: Recalc Engagement - INÍCIO')
    const step2Start = Date.now()

    try {
      console.log('[TAG-RULES] ▶️ A chamar recalculateAllEngagementMetrics()...')
      const recalcResult = await recalculateAllEngagementMetrics()
      console.log('[TAG-RULES] ✅ recalculateAllEngagementMetrics() retornou!')

      result.steps.recalcEngagement = {
        success: recalcResult.success,
        duration: Math.floor((Date.now() - step2Start) / 1000),
        stats: recalcResult.stats
      }

      result.summary.totalUserProducts = (recalcResult.stats?.total as number) || 0
      result.summary.engagementUpdated = (recalcResult.stats?.updated as number) || 0

      const total = recalcResult.stats?.total || 0
      const updated = recalcResult.stats?.updated || 0
      console.log(`[TAG-RULES] ✅ STEP 2/3 DONE: ${total} UserProducts, ${updated} atualizados, ${result.steps.recalcEngagement.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Recalc Engagement: ${message}`)
      result.success = false
      result.steps.recalcEngagement = {
        ...(result.steps.recalcEngagement as PipelineStepResult),
        success: false,
        error: message
      }
      console.log(`[TAG-RULES] ❌ STEP 2/3 ERROR: ${message}`)
    }

    // STEP 3/3: EVALUATE TAG RULES
    console.log('[TAG-RULES] ▶️ STEP 3/3: Tag Rules - INÍCIO')
    const step3Start = Date.now()

    try {
      // Filtrar alunos inativos do OGI_V1 (mesma lógica do pipeline completo)
      const cutoffDate = new Date('2024-12-31T23:59:59Z')
      const inactiveDaysThreshold = 380
      const cutoffActivityDate = new Date()
      cutoffActivityDate.setDate(cutoffActivityDate.getDate() - inactiveDaysThreshold)

      const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).select('_id').lean() as { _id: any } | null
      const ogiProductId = ogiProduct?._id?.toString()

      // Produtos a IGNORAR (não têm regras de tags)
      const PRODUCTS_TO_SKIP = ['DISCORD_COMMUNITY', 'DISCORD']
      const productsToSkip = await Product.find({
        code: { $in: PRODUCTS_TO_SKIP }
      }).select('_id').lean()
      const productIdsToSkip = new Set(productsToSkip.map((p: any) => p._id.toString()))
      console.log(`[TAG-RULES] 🚫 Produtos a ignorar: ${PRODUCTS_TO_SKIP.join(', ')}`)

      console.log('[TAG-RULES] ▶️ A buscar UserProducts ativos...')
      const userProducts = await UserProduct.find({ status: 'ACTIVE' })
        .select('userId productId metadata engagement')
        .populate({ path: 'userId', select: 'hotmart.lastAccessDate hotmart.firstAccessDate hotmart.progress.lastAccessDate metadata.purchaseDate email' })
        .populate({ path: 'productId', select: 'code' })
        .lean<any[]>()

      console.log(`[TAG-RULES] 📊 Total UserProducts ativos: ${userProducts.length}`)

      // Filtrar produtos sem regras de tags (DISCORD_COMMUNITY, etc)
      const userProductsWithTags = userProducts.filter((up) => {
        const productIdStr = up.productId?._id?.toString() || up.productId?.toString()
        if (productIdsToSkip.has(productIdStr)) return false
        return true
      })
      const skippedCount = userProducts.length - userProductsWithTags.length
      if (skippedCount > 0) {
        console.log(`[TAG-RULES] 🚫 ${skippedCount} UserProducts de produtos sem tags ignorados`)
      }

      const validUserProducts = userProductsWithTags.filter((up) => up.userId && up.userId._id)
      const orphanCount = userProductsWithTags.length - validUserProducts.length
      if (orphanCount > 0) {
        console.log(`[TAG-RULES] ⚠️ ${orphanCount} UserProducts órfãos ignorados`)
      }

      const filteredUserProducts = validUserProducts.filter((up) => {
        const productId = up.productId?._id?.toString() || up.productId?.toString()
        if (!ogiProductId || productId !== ogiProductId) return true

        const user = up.userId
        const lastAccessDate =
          user?.hotmart?.lastAccessDate ||
          user?.hotmart?.progress?.lastAccessDate ||
          user?.hotmart?.firstAccessDate
        const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate

        if (purchaseDate && new Date(purchaseDate) < cutoffDate) return false
        if (lastAccessDate && new Date(lastAccessDate) < cutoffActivityDate) return false
        return true
      })

      const filteredCount = validUserProducts.length - filteredUserProducts.length
      if (filteredCount > 0) {
        console.log(`[TAG-RULES] 🔍 Filtrados ${filteredCount} alunos OGI_V1 inativos`)
      }

      const items = filteredUserProducts
        .filter(up => up.userId && up.userId._id)
        .map((up) => ({
          userId: up.userId._id?.toString() || up.userId.toString(),
          productId: up.productId?._id?.toString() || up.productId?.toString()
        }))

      const orchestrationResults: any[] = []
      let lastLoggedPercent = 0
      let totalTagsApplied = 0
      let totalTagsRemoved = 0
      let totalErrors = 0

      console.log(`[TAG-RULES] 🚀 A processar ${items.length} UserProducts...`)

      for (const item of items) {
        const itemResult = await tagOrchestratorV2.orchestrateUserProduct(item.userId, item.productId)
          .catch((error) => ({
            userId: item.userId,
            productId: item.productId,
            productCode: '',
            tagsApplied: [],
            tagsRemoved: [],
            communicationsTriggered: 0,
            success: false,
            error: error.message
          }))

        orchestrationResults.push(itemResult)

        totalTagsApplied += itemResult.tagsApplied?.length || 0
        totalTagsRemoved += itemResult.tagsRemoved?.length || 0
        if (!itemResult.success) totalErrors++

        const processed = orchestrationResults.length
        const percentage = Math.floor((processed / items.length) * 100)
        const shouldLog = percentage >= lastLoggedPercent + 5 ||
                         processed === items.length ||
                         (processed % 100 === 0 && items.length > 2000)

        if (shouldLog) {
          const elapsed = (Date.now() - step3Start) / 1000
          const avgTimePerItem = elapsed / processed
          const remaining = items.length - processed
          const etaSec = Math.floor(avgTimePerItem * remaining)
          const etaMin = Math.floor(etaSec / 60)
          const etaSecRemainder = etaSec % 60

          console.log(`[TAG-RULES] 📊 ${percentage}% (${processed}/${items.length}) | +${totalTagsApplied} -${totalTagsRemoved} tags | ${totalErrors} erros | ETA: ${etaMin}m${etaSecRemainder}s`)
          lastLoggedPercent = percentage
        }
      }

      console.log(`[TAG-RULES] ✅ Processamento completo: ${items.length} UserProducts em ${Math.floor((Date.now() - step3Start) / 1000)}s`)

      const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)

      const tagsApplied = orchestrationResults.reduce(
        (sum: number, r: any) => sum + (r.tagsApplied?.length || 0),
        0
      )
      const tagsRemoved = orchestrationResults.reduce(
        (sum: number, r: any) => sum + (r.tagsRemoved?.length || 0),
        0
      )

      result.steps.evaluateTagRules = {
        success: stats.failed === 0,
        duration: Math.floor((Date.now() - step3Start) / 1000),
        stats: {
          total: stats.total,
          successful: stats.successful,
          failed: stats.failed,
          tagsApplied,
          tagsRemoved
        }
      }

      result.summary.tagsApplied = tagsApplied
      result.summary.tagsRemoved = tagsRemoved

      console.log(`[TAG-RULES] ✅ STEP 3/3 DONE: +${tagsApplied} tags, -${tagsRemoved} tags, ${result.steps.evaluateTagRules.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Tag Rules: ${message}`)
      result.success = false
      result.steps.evaluateTagRules = {
        success: false,
        duration: Math.floor((Date.now() - step3Start) / 1000),
        stats: { total: 0, successful: 0, failed: 1, tagsApplied: 0, tagsRemoved: 0 },
        error: message
      }
      console.log(`[TAG-RULES] ❌ STEP 3/3 ERROR: ${message}`)
    }

    // FINALIZAR
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = errors

    const durationMin = Math.floor(result.duration / 60)
    const durationSec = result.duration % 60
    const endTimestamp = new Date().toLocaleString('pt-PT', {
      dateStyle: 'short',
      timeStyle: 'short'
    })

    console.log('━'.repeat(60))
    if (result.success) {
      console.log('[TAG-RULES] 🎉 COMPLETO COM SUCESSO')
    } else {
      console.log('[TAG-RULES] ⚠️ COMPLETO COM ERROS')
    }
    console.log(`[TAG-RULES] Fim: ${endTimestamp} | Duração: ${durationMin}min ${durationSec}s`)
    console.log('[TAG-RULES] 📊 RESUMO:')
    console.log(`[TAG-RULES]    STEP 1 - Pre-create:   ${result.steps.preCreateTags.duration}s | ${result.steps.preCreateTags.stats?.totalTags || 0} tags`)
    console.log(`[TAG-RULES]    STEP 2 - Engagement:   ${result.steps.recalcEngagement.duration}s | ${result.steps.recalcEngagement.stats?.updated || 0} atualizados`)
    console.log(`[TAG-RULES]    STEP 3 - Tag Rules:    ${result.steps.evaluateTagRules.duration}s | +${result.summary.tagsApplied}/-${result.summary.tagsRemoved} tags`)
    console.log(`[TAG-RULES] 📈 Total: ${result.summary.totalUserProducts} UserProducts | +${result.summary.tagsApplied} -${result.summary.tagsRemoved} tags`)

    if (errors.length > 0) {
      console.log(`[TAG-RULES] ❌ ERROS (${errors.length}):`)
      errors.forEach((err, i) => console.log(`[TAG-RULES]    ${i + 1}. ${err}`))
    }
    console.log('━'.repeat(60))

    // Salvar histórico
    try {
      await PipelineExecution.create({
        executionType: 'manual',
        status: result.success ? 'success' : (errors.length > 0 ? 'partial' : 'failed'),
        startTime: new Date(startTime),
        endTime: result.completedAt,
        duration: result.duration,
        steps: result.steps,
        summary: result.summary,
        errorMessages: result.errors,
        triggeredBy: 'API'
      })
      console.log('[TAG-RULES] 💾 Histórico salvo')
    } catch (err: any) {
      console.log(`[TAG-RULES] ❌ Erro ao salvar histórico: ${err.message}`)
    }

    return result

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = [...errors, `Tag Rules Only fatal: ${message}`]

    console.log('━'.repeat(60))
    console.log('[TAG-RULES] ❌ FALHOU COMPLETAMENTE')
    console.log(`[TAG-RULES] Erro: ${message}`)
    console.log('━'.repeat(60))

    return result
  }
}

export default {
  executeDailyPipeline,
  executeTagRulesOnly
}