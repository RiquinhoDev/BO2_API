import { DailyPipelineResult, PipelineStepResult } from '../../types/cron.types'
import logger from '../../utils/logger'
import { recalculateAllEngagementMetrics } from '../syncUtilizadoresServices/engagement/recalculate-engagement-metrics'
import tagPreCreationService from '../activeCampaign/tagPreCreation.service'
import universalSyncService from '../syncUtilizadoresServices/universalSync'
import curseducaAdapter from '../syncUtilizadoresServices/curseducaServices/curseduca.adapter'
import hotmartAdapter from '../syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import { getProductsConfig, logStep } from './dailyPipelineSupport'

export async function executeSyncAndPreparationSteps(
  result: DailyPipelineResult,
  errors: string[],
): Promise<void> {
    const config = await getProductsConfig()
    // STEP 1/5: SYNC HOTMART
    const step1Start = Date.now()
    logStep(1, 'Sync Hotmart', 'START')

    try {
      let totalStats = { total: 0, inserted: 0, updated: 0, errors: 0 }
      const hotmartProductsCount = config.hotmart.products.length

      if (hotmartProductsCount > 0) {
        for (let idx = 0; idx < hotmartProductsCount; idx++) {
          const product = config.hotmart.products[idx]

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

    // STEP 3/5: PRÃ‰-CRIAR TAGS BO
    logger.info('   âž¡ï¸  TransiÃ§Ã£o Step 2 â†’ Step 3...')
    const step3Start = Date.now()
    logStep(3, 'Pre-create Tags', 'START')

    try {
      logger.info('   ðŸ“¦ Chamando tagPreCreationService.preCreateBOTags()...')
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
        logger.warn(`âš ï¸  ${preCreateResult.failed.length} tags falharam: ${preCreateResult.failed.join(', ')}`)
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
    logger.info('   âž¡ï¸  TransiÃ§Ã£o Step 3 â†’ Step 4...')
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
}
