import { Product, UserProduct, PipelineExecution } from '../../models'
import logger from '../../utils/logger'
import testimonialTagSyncService from '../activeCampaign/testimonialTagSync.service'
import pipelineSnapshotService, { type PipelineSnapshot, type SnapshotComparison } from '../activeCampaign/pipelineSnapshot.service'
import { DailyPipelineResult, PipelineStepResult } from '../../types/cron.types'
import tagOrchestratorV2, { type OrchestrationResult } from '../activeCampaign/tagOrchestrator.service'
import { hasPipelineReferences, logStep, type PipelineUserProduct } from './dailyPipelineSupport'
import { executeSyncAndPreparationSteps } from './dailyPipelineSyncSteps'

export async function executeDailyPipeline(): Promise<DailyPipelineResult> {
  const startTime = Date.now()
  const errors: string[] = []

  const startTimestamp = new Date().toLocaleString('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  })
  logger.info('â”'.repeat(60))
  logger.info(`ðŸš€ PIPELINE DIÃRIO - InÃ­cio: ${startTimestamp}`)
  logger.info('â”'.repeat(60))

  const result: DailyPipelineResult = {
    success: true,
    duration: 0,
    completedAt: new Date(),
    steps: {
      syncHotmart: { success: false, duration: 0, stats: {} },
      syncCursEduca: { success: false, duration: 0, stats: {} },
      preCreateTags: { success: false, duration: 0, stats: {} },
      recalcEngagement: { success: false, duration: 0, stats: {} },
      evaluateTagRules: { success: false, duration: 0, stats: {} },
      syncTestimonialTags: { success: false, duration: 0, stats: {} }
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
    await executeSyncAndPreparationSteps(result, errors)

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸ“¸ SNAPSHOT PRE (antes de aplicar tags)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    logger.info('   âž¡ï¸  TransiÃ§Ã£o Step 4 â†’ Step 5...')
    logger.info('   ðŸ“¸ Capturando snapshot PRE (antes de tags)...')

    let preSnapshot: PipelineSnapshot | null = null
    try {
      preSnapshot = await pipelineSnapshotService.captureSnapshot('PRE')
      await pipelineSnapshotService.saveSnapshot(preSnapshot, 'snapshot_PRE_latest.json')
      logger.info(`   âœ… Snapshot PRE: ${preSnapshot.stats.totalTags} tags, ${preSnapshot.stats.totalUsers} users`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`   âš ï¸  Erro ao capturar snapshot PRE: ${message}`)
    }

    // STEP 5/5: EVALUATE TAG RULES
    const step5Start = Date.now()
    logStep(5, 'Tag Rules', 'START')

    try {
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
      // FILTRAR ALUNOS INATIVOS DO OGI_V1
      // CondiÃ§Ãµes:
      // 1. Ãšltimo acesso > 380 dias
      // 2. OU compra antes de 31/12/2024
      // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

      const cutoffDate = new Date('2024-12-31T23:59:59Z')
      const inactiveDaysThreshold = 380
      const cutoffActivityDate = new Date()
      cutoffActivityDate.setDate(cutoffActivityDate.getDate() - inactiveDaysThreshold)

      // Buscar produto OGI_V1
      const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).select('_id').lean()
      const ogiProductId = ogiProduct?._id?.toString()

      // Produtos a IGNORAR (nÃ£o tÃªm regras de tags)
      const PRODUCTS_TO_SKIP = ['DISCORD_COMMUNITY', 'DISCORD']
      const productsToSkip = await Product.find({
        code: { $in: PRODUCTS_TO_SKIP }
      }).select('_id').lean()
      const productIdsToSkip = new Set(productsToSkip.map((product) => product._id.toString()))
      logger.info(`   ðŸš« Produtos a ignorar: ${PRODUCTS_TO_SKIP.join(', ')}`)

      // Buscar TODOS os UserProducts ativos
      const userProducts = await UserProduct.find({ status: 'ACTIVE' })
        .select('userId productId metadata engagement')
        .populate({ path: 'userId', select: 'hotmart.lastAccessDate hotmart.firstAccessDate hotmart.progress.lastAccessDate metadata.purchaseDate email' })
        .populate({ path: 'productId', select: 'code' })
        .lean<PipelineUserProduct[]>()

      logger.info(`   ðŸ“Š Total UserProducts ativos: ${userProducts.length}`)

      // Filtrar produtos sem regras de tags (DISCORD_COMMUNITY, etc)
      const userProductsWithTags = userProducts.filter((up) => {
        const productIdStr = up.productId?._id?.toString() || up.productId?.toString()
        if (productIdStr && productIdsToSkip.has(productIdStr)) return false
        return true
      })
      const skippedCount = userProducts.length - userProductsWithTags.length
      if (skippedCount > 0) {
        logger.info(`   ðŸš« ${skippedCount} UserProducts de produtos sem tags ignorados`)
      }

      // Filtrar UserProducts Ã³rfÃ£os (userId null)
      const validUserProducts = userProductsWithTags.filter(hasPipelineReferences)
      const orphanCount = userProductsWithTags.length - validUserProducts.length
      if (orphanCount > 0) {
        logger.warn(`   âš ï¸  ${orphanCount} UserProducts Ã³rfÃ£os ignorados`)
      }

      // Filtrar OGI_V1 inativos
      const filteredUserProducts = validUserProducts.filter((up) => {
        const productId = up.productId?._id?.toString() || up.productId?.toString()

        // Se nÃ£o Ã© OGI_V1, incluir sempre
        if (!ogiProductId || productId !== ogiProductId) {
          return true
        }

        // Ã‰ OGI_V1 â†’ aplicar filtros
        const user = up.userId

        // Fallback para lastAccessDate (mÃºltiplas fontes)
        const lastAccessDate =
          user?.hotmart?.lastAccessDate ||
          user?.hotmart?.progress?.lastAccessDate ||
          user?.hotmart?.firstAccessDate

        const purchaseDate = user?.metadata?.purchaseDate || up.metadata?.purchaseDate

        // Filtro 1: Compra antes de 31/12/2024
        if (purchaseDate && new Date(purchaseDate) < cutoffDate) {
          return false // Ignorar
        }

        // Filtro 2: Ãšltimo acesso > 380 dias (se tiver data)
        if (lastAccessDate && new Date(lastAccessDate) < cutoffActivityDate) {
          return false // Ignorar
        }

        // Se NÃƒO tem lastAccessDate â†’ INCLUIR (assumir que Ã© aluno recente)
        return true
      })

      const filteredCount = validUserProducts.length - filteredUserProducts.length
      if (filteredCount > 0) {
        logger.info(`   ðŸ” Filtrados ${filteredCount} alunos OGI_V1 inativos`)
      }

      // Mapear items para processamento
      const items = filteredUserProducts
        .map((up) => ({
          userId: up.userId._id.toString(),
          productId: up.productId._id.toString()
        }))

      // Processamento sequencial (evita race conditions no rate limiting)
      const orchestrationResults: OrchestrationResult[] = []
      let lastLoggedPercent = 0
      let totalTagsApplied = 0
      let totalTagsRemoved = 0
      let totalErrors = 0

      logger.info(`   ðŸš€ Iniciando Step 5: ${items.length} UserProducts a processar...`)

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

          logger.info(`   ðŸ“Š ${percentage}% (${processed}/${items.length}) | +${totalTagsApplied} -${totalTagsRemoved} tags | ${totalErrors} erros | ETA: ${etaMin}m${etaSecRemainder}s`)
          lastLoggedPercent = percentage
        }
      }

      logger.info(`   âœ… Processamento completo: ${items.length} UserProducts em ${Math.floor((Date.now() - step5Start) / 1000)}s`)

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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // ðŸ“¸ SNAPSHOT POST (depois de aplicar tags)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    logger.info('   ðŸ“¸ Capturando snapshot POST (depois de tags)...')

    let postSnapshot: PipelineSnapshot | null = null
    let comparison: SnapshotComparison | null = null

    try {
      postSnapshot = await pipelineSnapshotService.captureSnapshot('POST')
      await pipelineSnapshotService.saveSnapshot(postSnapshot, 'snapshot_POST_latest.json')
      logger.info(`   âœ… Snapshot POST: ${postSnapshot.stats.totalTags} tags, ${postSnapshot.stats.totalUsers} users`)

      // Comparar snapshots se ambos existirem
      if (preSnapshot && postSnapshot) {
        logger.info('   ðŸ” Comparando snapshots PRE vs POST...')
        comparison = pipelineSnapshotService.compareSnapshots(preSnapshot, postSnapshot)

        await pipelineSnapshotService.saveComparison(comparison, 'comparison_latest.json')
        await pipelineSnapshotService.saveMarkdownReport(comparison, 'report_latest.md')

        logger.info('   âœ… ComparaÃ§Ã£o concluÃ­da:', {
          tagsAdded: comparison.diff.summary.totalTagsAdded,
          tagsRemoved: comparison.diff.summary.totalTagsRemoved,
          usersAffected: comparison.diff.summary.usersAffected
        })

        logger.info('   ðŸ“‚ Snapshots e relatÃ³rio salvos em: ./snapshots/')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(`   âš ï¸  Erro ao capturar snapshot POST: ${message}`)
    }

    // STEP 6/6: SYNC TESTIMONIAL TAGS
    logger.info('   âž¡ï¸  TransiÃ§Ã£o Step 5 â†’ Step 6...')
    const step6Start = Date.now()
    logStep(6, 'Sync Testimonial Tags', 'START')

    try {
      const syncResult = await testimonialTagSyncService.syncTestimonialTags()

      result.steps.syncTestimonialTags = {
        success: syncResult.success,
        duration: Math.floor((Date.now() - step6Start) / 1000),
        stats: syncResult.stats
      }

      logStep(6, 'Sync Testimonial Tags', 'DONE', `${syncResult.stats.synced} tags sincronizadas, ${result.steps.syncTestimonialTags.duration}s`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`Sync Testimonial Tags: ${message}`)

      result.success = false
      result.steps.syncTestimonialTags = {
        ...(result.steps.syncTestimonialTags as PipelineStepResult),
        success: false,
        error: message
      }

      logStep(6, 'Sync Testimonial Tags', 'ERROR', message)
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
      logger.info('ðŸŽ‰ PIPELINE COMPLETO COM SUCESSO')
    } else {
      logger.warn('âš ï¸  PIPELINE COMPLETO COM ERROS')
    }

    logger.info(`Fim: ${endTimestamp} | DuraÃ§Ã£o: ${durationMin}min ${durationSec}s`)
    logger.info('')
    logger.info('ðŸ“Š RESUMO:')
    logger.info(`   STEP 1 - Hotmart:           ${result.steps.syncHotmart.duration}s | ${result.steps.syncHotmart.stats?.total || 0} users`)
    logger.info(`   STEP 2 - CursEduca:         ${result.steps.syncCursEduca.duration}s | ${result.steps.syncCursEduca.stats?.total || 0} users`)
    logger.info(`   STEP 3 - Pre-create:        ${result.steps.preCreateTags.duration}s | ${result.steps.preCreateTags.stats?.totalTags || 0} tags`)
    logger.info(`   STEP 4 - Engagement:        ${result.steps.recalcEngagement.duration}s | ${result.steps.recalcEngagement.stats?.updated || 0} atualizados`)
    logger.info(`   STEP 5 - Tag Rules:         ${result.steps.evaluateTagRules.duration}s | +${result.steps.evaluateTagRules.stats?.tagsApplied || 0}/-${result.steps.evaluateTagRules.stats?.tagsRemoved || 0} tags`)
    logger.info(`   STEP 6 - Testimonial Tags:  ${result.steps.syncTestimonialTags.duration}s | ${result.steps.syncTestimonialTags.stats?.synced || 0} sincronizadas`)
    logger.info('')
    logger.info(`ðŸ“ˆ Total: ${result.summary.totalUsers} users | ${result.summary.totalUserProducts} UserProducts | ${result.summary.tagsApplied} tags aplicadas`)

    if (errors.length > 0) {
      logger.info('')
      logger.error(`âŒ ERROS (${errors.length}):`)
      errors.forEach((err, i) => logger.error(`   ${i + 1}. ${err}`))
    }

    logger.info('â”'.repeat(60))

    // Salvar histÃ³rico de execuÃ§Ã£o
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
      logger.info('ðŸ’¾ HistÃ³rico salvo')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`âŒ Erro ao salvar histÃ³rico: ${message}`)
    }

    return result
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)

    result.success = false
    result.duration = Math.floor((Date.now() - startTime) / 1000)
    result.completedAt = new Date()
    result.errors = [...errors, `Pipeline fatal: ${message}`]

    logger.error('â”'.repeat(60))
    logger.error('âŒ PIPELINE FALHOU COMPLETAMENTE')
    logger.error(`Erro: ${message}`)
    logger.error('â”'.repeat(60))

    return result
  }
}
