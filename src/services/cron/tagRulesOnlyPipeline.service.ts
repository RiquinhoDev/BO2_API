import logger from '../../utils/logger'
import { Product, UserProduct, PipelineExecution } from '../../models'
import { PipelineStepResult } from '../../types/cron.types'
import { recalculateAllEngagementMetrics } from '../syncUtilizadoresServices/engagement/recalculate-engagement-metrics'
import tagPreCreationService from '../activeCampaign/tagPreCreation.service'
import pipelineSnapshotService, { type PipelineSnapshot, type SnapshotComparison } from '../activeCampaign/pipelineSnapshot.service'
import tagOrchestratorV2, { type OrchestrationResult } from '../activeCampaign/tagOrchestrator.service'
import { hasPipelineReferences, type PipelineUserProduct } from './dailyPipelineSupport'

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
 * Ãštil para aplicar tags rapidamente sem esperar pelo sync completo
 *
 * Steps executados:
 * - Step 3: Pre-create Tags BO (garante que tags existem na AC)
 * - Step 4: Recalc Engagement (atualiza mÃ©tricas)
 * - Step 5: Evaluate Tag Rules (aplica/remove tags)
 */
export async function executeTagRulesOnly(): Promise<TagRulesOnlyResult> {
  logger.info('[TAG-RULES] â–¶ï¸ FunÃ§Ã£o iniciada!')

  const startTime = Date.now()
  const errors: string[] = []

  const startTimestamp = new Date().toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  })

  logger.info('[TAG-RULES] â–¶ï¸ Timestamp:', startTimestamp)
  logger.info('[TAG-RULES] â–¶ï¸ A criar objeto result...')

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
    // STEP 1/3: PRÃ‰-CRIAR TAGS BO
    logger.info('[TAG-RULES] â–¶ï¸ STEP 1/3: Pre-create Tags - INÃCIO')
    const step1Start = Date.now()

    try {
      logger.info('[TAG-RULES] â–¶ï¸ A chamar tagPreCreationService.preCreateBOTags()...')
      const preCreateResult = await tagPreCreationService.preCreateBOTags()
      logger.info('[TAG-RULES] âœ… preCreateBOTags() retornou!')

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
        logger.info(`[TAG-RULES] âš ï¸ ${preCreateResult.failed.length} tags falharam: ${preCreateResult.failed.join(', ')}`)
      }

      logger.info(`[TAG-RULES] âœ… STEP 1/3 DONE: ${preCreateResult.totalTags} tags, ${result.steps.preCreateTags.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Pre-create Tags: ${message}`)
      result.success = false
      result.steps.preCreateTags = {
        ...(result.steps.preCreateTags as PipelineStepResult),
        success: false,
        error: message
      }
      logger.info(`[TAG-RULES] âŒ STEP 1/3 ERROR: ${message}`)
    }

    // STEP 2/3: RECALC ENGAGEMENT
    logger.info('[TAG-RULES] â–¶ï¸ STEP 2/3: Recalc Engagement - INÃCIO')
    const step2Start = Date.now()

    try {
      logger.info('[TAG-RULES] â–¶ï¸ A chamar recalculateAllEngagementMetrics()...')
      const recalcResult = await recalculateAllEngagementMetrics()
      logger.info('[TAG-RULES] âœ… recalculateAllEngagementMetrics() retornou!')

      result.steps.recalcEngagement = {
        success: recalcResult.success,
        duration: Math.floor((Date.now() - step2Start) / 1000),
        stats: recalcResult.stats
      }

      result.summary.totalUserProducts = (recalcResult.stats?.total as number) || 0
      result.summary.engagementUpdated = (recalcResult.stats?.updated as number) || 0

      const total = recalcResult.stats?.total || 0
      const updated = recalcResult.stats?.updated || 0
      logger.info(`[TAG-RULES] âœ… STEP 2/3 DONE: ${total} UserProducts, ${updated} atualizados, ${result.steps.recalcEngagement.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Recalc Engagement: ${message}`)
      result.success = false
      result.steps.recalcEngagement = {
        ...(result.steps.recalcEngagement as PipelineStepResult),
        success: false,
        error: message
      }
      logger.info(`[TAG-RULES] âŒ STEP 2/3 ERROR: ${message}`)
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸ“¸ SNAPSHOT PRE (antes de aplicar tags)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    logger.info('[TAG-RULES] ðŸ“¸ Capturando snapshot PRE...')
    let preSnapshot: PipelineSnapshot | null = null
    try {
      preSnapshot = await pipelineSnapshotService.captureSnapshot('PRE')
      await pipelineSnapshotService.saveSnapshot(preSnapshot, 'snapshot_PRE_tagrules.json')
      logger.info(`[TAG-RULES] âœ… Snapshot PRE: ${preSnapshot.stats.totalTags} tags, ${preSnapshot.stats.totalUsers} users`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.info(`[TAG-RULES] âš ï¸ Erro ao capturar snapshot PRE: ${message}`)
    }

    // STEP 3/3: EVALUATE TAG RULES
    logger.info('[TAG-RULES] â–¶ï¸ STEP 3/3: Tag Rules - INÃCIO')
    const step3Start = Date.now()

    try {
      // Filtrar alunos inativos do OGI_V1 (mesma lÃ³gica do pipeline completo)
      const cutoffDate = new Date('2024-12-31T23:59:59Z')
      const inactiveDaysThreshold = 380
      const cutoffActivityDate = new Date()
      cutoffActivityDate.setDate(cutoffActivityDate.getDate() - inactiveDaysThreshold)

      const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).select('_id').lean()
      const ogiProductId = ogiProduct?._id?.toString()

      // Produtos a IGNORAR (nÃ£o tÃªm regras de tags)
      const PRODUCTS_TO_SKIP = ['DISCORD_COMMUNITY', 'DISCORD']
      const productsToSkip = await Product.find({
        code: { $in: PRODUCTS_TO_SKIP }
      }).select('_id').lean()
      const productIdsToSkip = new Set(productsToSkip.map((product) => product._id.toString()))
      logger.info(`[TAG-RULES] ðŸš« Produtos a ignorar: ${PRODUCTS_TO_SKIP.join(', ')}`)

      logger.info('[TAG-RULES] â–¶ï¸ A buscar UserProducts ativos...')
      const userProducts = await UserProduct.find({ status: 'ACTIVE' })
        .select('userId productId metadata engagement')
        .populate({ path: 'userId', select: 'hotmart.lastAccessDate hotmart.firstAccessDate hotmart.progress.lastAccessDate metadata.purchaseDate email' })
        .populate({ path: 'productId', select: 'code' })
        .lean<PipelineUserProduct[]>()

      logger.info(`[TAG-RULES] ðŸ“Š Total UserProducts ativos: ${userProducts.length}`)

      // Filtrar produtos sem regras de tags (DISCORD_COMMUNITY, etc)
      const userProductsWithTags = userProducts.filter((up) => {
        const productIdStr = up.productId?._id?.toString() || up.productId?.toString()
        if (productIdStr && productIdsToSkip.has(productIdStr)) return false
        return true
      })
      const skippedCount = userProducts.length - userProductsWithTags.length
      if (skippedCount > 0) {
        logger.info(`[TAG-RULES] ðŸš« ${skippedCount} UserProducts de produtos sem tags ignorados`)
      }

      const validUserProducts = userProductsWithTags.filter(hasPipelineReferences)
      const orphanCount = userProductsWithTags.length - validUserProducts.length
      if (orphanCount > 0) {
        logger.info(`[TAG-RULES] âš ï¸ ${orphanCount} UserProducts Ã³rfÃ£os ignorados`)
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
        logger.info(`[TAG-RULES] ðŸ” Filtrados ${filteredCount} alunos OGI_V1 inativos`)
      }

      const items = filteredUserProducts
        .map((up) => ({
          userId: up.userId._id.toString(),
          productId: up.productId._id.toString()
        }))

      const orchestrationResults: OrchestrationResult[] = []
      let lastLoggedPercent = 0
      let totalTagsApplied = 0
      let totalTagsRemoved = 0
      let totalErrors = 0

      logger.info(`[TAG-RULES] ðŸš€ A processar ${items.length} UserProducts...`)

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

          logger.info(`[TAG-RULES] ðŸ“Š ${percentage}% (${processed}/${items.length}) | +${totalTagsApplied} -${totalTagsRemoved} tags | ${totalErrors} erros | ETA: ${etaMin}m${etaSecRemainder}s`)
          lastLoggedPercent = percentage
        }
      }

      logger.info(`[TAG-RULES] âœ… Processamento completo: ${items.length} UserProducts em ${Math.floor((Date.now() - step3Start) / 1000)}s`)

      const stats = tagOrchestratorV2.getExecutionStats(orchestrationResults)

      const tagsApplied = orchestrationResults.reduce(
        (sum, orchestrationResult) => sum + orchestrationResult.tagsApplied.length,
        0
      )
      const tagsRemoved = orchestrationResults.reduce(
        (sum, orchestrationResult) => sum + orchestrationResult.tagsRemoved.length,
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

      logger.info(`[TAG-RULES] âœ… STEP 3/3 DONE: +${tagsApplied} tags, -${tagsRemoved} tags, ${result.steps.evaluateTagRules.duration}s`)
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
      logger.info(`[TAG-RULES] âŒ STEP 3/3 ERROR: ${message}`)
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸ“¸ SNAPSHOT POST (depois de aplicar tags)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    logger.info('[TAG-RULES] ðŸ“¸ Capturando snapshot POST...')
    let postSnapshot: PipelineSnapshot | null = null
    let comparison: SnapshotComparison | null = null

    try {
      postSnapshot = await pipelineSnapshotService.captureSnapshot('POST')
      await pipelineSnapshotService.saveSnapshot(postSnapshot, 'snapshot_POST_tagrules.json')
      logger.info(`[TAG-RULES] âœ… Snapshot POST: ${postSnapshot.stats.totalTags} tags, ${postSnapshot.stats.totalUsers} users`)

      // Comparar snapshots se ambos existirem
      if (preSnapshot && postSnapshot) {
        logger.info('[TAG-RULES] ðŸ” Comparando snapshots PRE vs POST...')
        comparison = pipelineSnapshotService.compareSnapshots(preSnapshot, postSnapshot)

        await pipelineSnapshotService.saveComparison(comparison, 'comparison_tagrules.json')
        await pipelineSnapshotService.saveMarkdownReport(comparison, 'report_tagrules.md')

        logger.info('[TAG-RULES] âœ… ComparaÃ§Ã£o:', {
          tagsAdded: comparison.diff.summary.totalTagsAdded,
          tagsRemoved: comparison.diff.summary.totalTagsRemoved,
          usersAffected: comparison.diff.summary.usersAffected
        })

        logger.info('[TAG-RULES] ðŸ“‚ Ficheiros salvos em: ./snapshots/')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.info(`[TAG-RULES] âš ï¸ Erro ao capturar snapshot POST: ${message}`)
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

    logger.info('â”'.repeat(60))
    if (result.success) {
      logger.info('[TAG-RULES] ðŸŽ‰ COMPLETO COM SUCESSO')
    } else {
      logger.info('[TAG-RULES] âš ï¸ COMPLETO COM ERROS')
    }
    logger.info(`[TAG-RULES] Fim: ${endTimestamp} | DuraÃ§Ã£o: ${durationMin}min ${durationSec}s`)
    logger.info('[TAG-RULES] ðŸ“Š RESUMO:')
    logger.info(`[TAG-RULES]    STEP 1 - Pre-create:   ${result.steps.preCreateTags.duration}s | ${result.steps.preCreateTags.stats?.totalTags || 0} tags`)
    logger.info(`[TAG-RULES]    STEP 2 - Engagement:   ${result.steps.recalcEngagement.duration}s | ${result.steps.recalcEngagement.stats?.updated || 0} atualizados`)
    logger.info(`[TAG-RULES]    STEP 3 - Tag Rules:    ${result.steps.evaluateTagRules.duration}s | +${result.summary.tagsApplied}/-${result.summary.tagsRemoved} tags`)
    logger.info(`[TAG-RULES] ðŸ“ˆ Total: ${result.summary.totalUserProducts} UserProducts | +${result.summary.tagsApplied} -${result.summary.tagsRemoved} tags`)

    if (errors.length > 0) {
      logger.info(`[TAG-RULES] âŒ ERROS (${errors.length}):`)
      errors.forEach((err, i) => logger.info(`[TAG-RULES]    ${i + 1}. ${err}`))
    }
    logger.info('â”'.repeat(60))

    // Salvar histÃ³rico
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
      logger.info('[TAG-RULES] ðŸ’¾ HistÃ³rico salvo')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.info(`[TAG-RULES] âŒ Erro ao salvar histÃ³rico: ${message}`)
    }

    return result

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = [...errors, `Tag Rules Only fatal: ${message}`]

    logger.info('â”'.repeat(60))
    logger.info('[TAG-RULES] âŒ FALHOU COMPLETAMENTE')
    logger.info(`[TAG-RULES] Erro: ${message}`)
    logger.info('â”'.repeat(60))

    return result
  }
}
