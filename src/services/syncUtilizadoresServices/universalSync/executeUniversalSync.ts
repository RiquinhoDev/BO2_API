import logger from '../../../utils/logger'
// ════════════════════════════════════════════════════════════
// 📁 universalSync/executeUniversalSync.ts
// The universal-sync orchestration: create the SyncReport + SyncHistory, run
// processSyncItem over the source batches, run the (passive) expired-student
// inactivation for Hotmart, and finalise the report/history. All Mongo reads/
// writes here; the per-item field logic lives in processSyncItem.
// ════════════════════════════════════════════════════════════

import syncReportsService from '../syncReports.service'
import SyncHistory from '../../../models/SyncModels/SyncHistory'
import { SyncError, SyncWarning, UniversalSyncConfig, UniversalSyncResult } from '../../../types/universalSync.types'
import { createUniversalSnapshotContext } from '../universalSyncSnapshot'
import { getDocId } from './fieldUtils'
import { productsCache } from './productsCache'
import { processSyncItem } from './processSyncItem'
import { debugLog } from './debugLog'

// ═══════════════════════════════════════════════════════════
// MAIN SYNC FUNCTION
// ═══════════════════════════════════════════════════════════

export const executeUniversalSync = async (
  config: UniversalSyncConfig
): Promise<UniversalSyncResult> => {
  logger.info('🚀 [UniversalSync] Iniciando sync:', config.jobName)
  logger.info(`   📊 Tipo: ${config.syncType}`)
  logger.info(`   🎯 Trigger: ${config.triggeredBy}`)
  logger.info(`   📦 Batch Size: ${config.batchSize}`)

  const startTime = Date.now()

  let reportId: string | null = null
  let syncHistoryId: string | null = null

  const stats = {
    total: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
    skipped: 0,
    unchanged: 0
  }

  const errors: SyncError[] = []
  const warnings: SyncWarning[] = []

  let rid = ''
  let hid = ''

  try {
    // ✅ OTIMIZAÇÃO FASE 1: Pre-load cache de produtos
    debugLog('📦 [ProductCache] Carregando produtos...')
    await productsCache.preload()

    // ═══════════════════════════════════════════════════════════
    // STEP 1: CRIAR SYNCREPORT
    // ═══════════════════════════════════════════════════════════

    const report = await syncReportsService.createSyncReport({
      jobId: config.jobId,
      jobName: config.jobName,
      syncType: config.syncType,
      triggeredBy: config.triggeredBy,
      triggeredByUser: config.triggeredByUser,
      syncConfig: {
        fullSync: config.fullSync,
        includeProgress: config.includeProgress,
        includeTags: config.includeTags,
        batchSize: config.batchSize
      }
    })

    rid = getDocId(report, 'SyncReport')
    reportId = rid

    logger.info(`✅ [UniversalSync] Report criado: ${rid}`)

    await syncReportsService.addReportLog(rid, 'info', `Iniciando sincronização ${config.syncType}`, {
      fullSync: config.fullSync,
      batchSize: config.batchSize,
      dataSourceSize: Array.isArray(config.sourceData) ? config.sourceData.length : 1
    })

    // ═══════════════════════════════════════════════════════════
    // STEP 2: CRIAR SYNCHISTORY
    // ═══════════════════════════════════════════════════════════

    const syncHistory = await SyncHistory.create({
      type: config.syncType,
      status: 'running',
      startedAt: new Date(),
      stats: {
        total: 0,
        added: 0,
        updated: 0,
        conflicts: 0,
        errors: 0
      },
      user: config.triggeredByUser || undefined,
      triggeredBy: {
        type: config.triggeredBy,
        userId: config.triggeredByUser,
        cronJobId: config.jobId
      }
    })

    hid = getDocId(syncHistory, 'SyncHistory')
    syncHistoryId = hid
    const snapshotContext = createUniversalSnapshotContext(config.syncType, hid)

    logger.info(`✅ [UniversalSync] SyncHistory criado: ${hid}`)

    // ═══════════════════════════════════════════════════════════
    // STEP 3: PROCESSAR DADOS
    // ═══════════════════════════════════════════════════════════

    await syncReportsService.addReportLog(rid, 'info', 'Processando dados da fonte...')

    const sourceArray = Array.isArray(config.sourceData) ? config.sourceData : [config.sourceData]
    stats.total = sourceArray.length

    for (let i = 0; i < sourceArray.length; i += config.batchSize) {
      const batch = sourceArray.slice(i, i + config.batchSize)
      const batchNumber = Math.floor(i / config.batchSize) + 1
      const totalBatches = Math.ceil(sourceArray.length / config.batchSize)

      logger.info(`📦 [UniversalSync] Processando batch ${batchNumber}/${totalBatches} (${batch.length} itens)`)

      await syncReportsService.addReportLog(
        rid,
        'info',
        `Processando batch ${batchNumber}/${totalBatches}`,
        { batchSize: batch.length, startIndex: i }
      )

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]

        try {
          const result = await processSyncItem(item, config, snapshotContext)

          if (result.action === 'inserted') stats.inserted++
          else if (result.action === 'updated') stats.updated++
          else if (result.action === 'unchanged') stats.unchanged++
          else if (result.action === 'skipped') stats.skipped++

          if (config.onProgress) {
            const current = i + j + 1
            config.onProgress({
              current,
              total: stats.total,
              percentage: (current / stats.total) * 100,
              message: `Processando ${current}/${stats.total}`
            })
          }
        } catch (err: unknown) {
          stats.errors++

          const e = err as { message?: unknown; stack?: unknown; code?: unknown }
          const message = typeof e.message === 'string' ? e.message : 'Erro desconhecido'

          const syncError: SyncError = {
            message,
            userId:
              (typeof item.id === 'string' ? item.id : undefined) ||
              (typeof item.userId === 'string' ? item.userId : undefined),
            userEmail: item.email,
            stack: typeof e.stack === 'string' ? e.stack : undefined,
            code: typeof e.code === 'string' ? e.code : undefined
          }

          errors.push(syncError)

          await syncReportsService.addReportError(
            rid,
            syncError.message,
            syncError.userId,
            syncError.userEmail,
            syncError.stack
          )

          if (config.onError) config.onError(syncError)

          logger.error('❌ [UniversalSync] Erro ao processar item:', syncError.message)
        }
      }

      if (i + config.batchSize < sourceArray.length) {
        await new Promise<void>(resolve => {
          setTimeout(() => resolve(), 100)
        })
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 4: ATUALIZAR STATS
    // ═══════════════════════════════════════════════════════════

    await syncReportsService.updateReportStats(rid, stats)

    // ═══════════════════════════════════════════════════════════
    // STEP 5: FINALIZAR REPORT
    // ═══════════════════════════════════════════════════════════

    const finalStatus =
      stats.errors > 0 ? (stats.errors === stats.total ? 'failed' : 'partial') : 'success'

    await syncReportsService.completeReport(rid, finalStatus)

    // ═══════════════════════════════════════════════════════════
    // STEP 6: FINALIZAR SYNCHISTORY
    // ═══════════════════════════════════════════════════════════

    const completedAt = new Date()
    const durationSeconds = Math.floor((completedAt.getTime() - new Date(syncHistory.startedAt).getTime()) / 1000)

    await SyncHistory.findByIdAndUpdate(syncHistoryId, {
      status: 'completed',
      completedAt,
      'stats.total': stats.total,
      'stats.added': stats.inserted,
      'stats.updated': stats.updated,
      'stats.errors': stats.errors,
      duration: durationSeconds,
      'metrics.duration': durationSeconds,
      'metrics.usersPerSecond': durationSeconds > 0 ? stats.total / durationSeconds : 0,
      'metrics.avgTimePerUser': stats.total > 0 ? (durationSeconds * 1000) / stats.total : 0
    })

    logger.info(`✅ [UniversalSync] SyncHistory finalizado: ${syncHistoryId}`)

    // ═══════════════════════════════════════════════════════════
    // STEP 7: CALCULAR DURAÇÃO E RETORNAR
    // ═══════════════════════════════════════════════════════════

    const duration = Math.floor((Date.now() - startTime) / 1000)

    logger.info('✅ [UniversalSync] Sync concluída!')
    logger.info(`   ⏱️ Duração: ${duration}s`)
    logger.info(`   📊 Stats: ${stats.inserted} novos, ${stats.updated} atualizados, ${stats.errors} erros`)

    return {
      success: finalStatus !== 'failed',
      reportId: rid,
      syncHistoryId: hid,
      stats,
      duration,
      errors,
      warnings
    }
  } catch (err: unknown) {
    const e = err as { message?: unknown; stack?: unknown }
    const message = typeof e.message === 'string' ? e.message : 'Erro desconhecido'
    const stack = typeof e.stack === 'string' ? e.stack : undefined

    logger.error('❌ [UniversalSync] Erro fatal:', message)

    if (reportId) {
      await syncReportsService.addReportError(
        reportId,
        `Erro fatal: ${message}`,
        undefined,
        undefined,
        stack
      )
      await syncReportsService.completeReport(reportId, 'failed')
    }

    if (syncHistoryId) {
      const errorTime = new Date()
      const durationSeconds = Math.floor((errorTime.getTime() - new Date().getTime()) / 1000)

      await SyncHistory.findByIdAndUpdate(syncHistoryId, {
        status: 'failed',
        completedAt: errorTime,
        duration: durationSeconds,
        $push: { errorDetails: message },
        'stats.total': stats.total,
        'stats.added': stats.inserted,
        'stats.updated': stats.updated,
        'stats.errors': stats.errors + 1
      })
    }

    throw err
  }
}
