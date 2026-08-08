// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/universalSync.service.ts
// Service: Universal Sync - Unifica Manual + Automático
// ✅ VERSÃO FINAL: Escalável, flexível, sem hardcodes
// ════════════════════════════════════════════════════════════

import syncReportsService from './syncReports.service'
import SyncHistory from '../../models/SyncModels/SyncHistory'
import User from '../../models/user'
import { UserProduct } from '../../models'
import { Class } from '../../models/Class'
import { SyncError, SyncWarning, UniversalSyncConfig, UniversalSyncResult } from '../../types/universalSync.types'
import { createUniversalSnapshotContext } from './universalSyncSnapshot'
import { errorMessage, getDocId } from './universalSync/fieldUtils'
import { productsCache } from './universalSync/productsCache'
import { EXPIRATION_DAYS } from './universalSync/hotmartExpiration'
import { ExpiredStudentsCollector } from './universalSync/expiredStudentsCollector'
import { processSyncItem } from './universalSync/processSyncItem'
import { debugLog } from './universalSync/debugLog'

export { calculateEngagementMetricsForUserProduct } from './universalSync/engagement/engagementMetrics'

export { clearProductsCache } from './universalSync/productsCache'

export { buildCanonicalActiveUserStatusUpdate } from './universalSync/canonicalUserStatus'

// ═══════════════════════════════════════════════════════════
// MAIN SYNC FUNCTION
// ═══════════════════════════════════════════════════════════

export const executeUniversalSync = async (
  config: UniversalSyncConfig
): Promise<UniversalSyncResult> => {
  console.log('🚀 [UniversalSync] Iniciando sync:', config.jobName)
  console.log(`   📊 Tipo: ${config.syncType}`)
  console.log(`   🎯 Trigger: ${config.triggeredBy}`)
  console.log(`   📦 Batch Size: ${config.batchSize}`)

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

    // Coletor de expirados desta execução — isolado por run, sem estado global.
    const expiredCollector = new ExpiredStudentsCollector()

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

    console.log(`✅ [UniversalSync] Report criado: ${rid}`)

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

    console.log(`✅ [UniversalSync] SyncHistory criado: ${hid}`)

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

      console.log(`📦 [UniversalSync] Processando batch ${batchNumber}/${totalBatches} (${batch.length} itens)`)

      await syncReportsService.addReportLog(
        rid,
        'info',
        `Processando batch ${batchNumber}/${totalBatches}`,
        { batchSize: batch.length, startIndex: i }
      )

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]

        try {
          const result = await processSyncItem(item, config, snapshotContext, expiredCollector)

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

          console.error('❌ [UniversalSync] Erro ao processar item:', syncError.message)
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
    // 🆕 STEP 4.5: PROCESSAR ALUNOS EXPIRADOS (só para Hotmart)
    // ═══════════════════════════════════════════════════════════

    let expirationResult = null
    if (config.syncType === 'hotmart') {
      await syncReportsService.addReportLog(rid, 'info', 'Verificando alunos com compra expirada (> 380 dias)...')

      expirationResult = await processExpiredStudentsInactivation(expiredCollector)

      if (expirationResult.totalInactivated > 0) {
        await syncReportsService.addReportLog(
          rid,
          'info',
          `Expiração automática: ${expirationResult.totalInactivated} alunos inativados, ${expirationResult.classesAffected.length} turmas afetadas`,
          {
            totalProcessed: expirationResult.totalProcessed,
            totalInactivated: expirationResult.totalInactivated,
            classesAffected: expirationResult.classesAffected
          }
        )
      }
    }

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

    console.log(`✅ [UniversalSync] SyncHistory finalizado: ${syncHistoryId}`)

    // ═══════════════════════════════════════════════════════════
    // STEP 7: CALCULAR DURAÇÃO E RETORNAR
    // ═══════════════════════════════════════════════════════════

    const duration = Math.floor((Date.now() - startTime) / 1000)

    console.log('✅ [UniversalSync] Sync concluída!')
    console.log(`   ⏱️ Duração: ${duration}s`)
    console.log(`   📊 Stats: ${stats.inserted} novos, ${stats.updated} atualizados, ${stats.errors} erros`)

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

    console.error('❌ [UniversalSync] Erro fatal:', message)

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

// ═══════════════════════════════════════════════════════════
// 🆕 NOVO: DETETAR E INATIVAR ALUNOS COM COMPRA > 380 DIAS
// ═══════════════════════════════════════════════════════════

// ⛔ Inactivação automática DESLIGADA: a inactivação passa a ser SÓ manual,
// pelo mecanismo do Backoffice. O automatismo por dias inactivava alunos
// renovados indevidamente. Mudar para true só se se quiser voltar a ligar.
const AUTO_INACTIVATION_ENABLED = false

/**
 * Processa a inativação em lote de todos os alunos expirados
 * Chamado no final do sync Hotmart
 */
async function processExpiredStudentsInactivation(
  expiredCollector: ExpiredStudentsCollector,
): Promise<{
  totalProcessed: number
  totalInactivated: number
  classesAffected: string[]
  errors: string[]
}> {
  const result = {
    totalProcessed: 0,
    totalInactivated: 0,
    classesAffected: [] as string[],
    errors: [] as string[]
  }

  // ⛔ Inactivação automática desligada — manual-only via Backoffice.
  if (!AUTO_INACTIVATION_ENABLED) {
    console.log('⏭️ [ExpirationCheck] Inactivação automática DESLIGADA — só manual pelo Backoffice.')
    return result
  }

  const expiredList = expiredCollector.all()

  if (expiredList.length === 0) {
    console.log(`✅ [ExpirationCheck] Nenhum aluno expirado encontrado`)
    return result
  }

  console.log(`\n🔄 [ExpirationCheck] Processando ${expiredList.length} alunos com acesso expirado...`)

  // Agrupar por turma para depois atualizar
  const classesWithExpiredStudents = new Map<string, number>()

  for (const student of expiredList) {
    result.totalProcessed++

    try {
      // Verificar se já está inativo
      const user = await User.findById(student.userId).lean()

      if (!user) {
        result.errors.push(`User não encontrado: ${student.email}`)
        continue
      }

      // Se já está inativo, pular
      if (user.combined?.status === 'INACTIVE' || user.inactivation?.isManuallyInactivated) {
        debugLog(`   ⏭️ ${student.email} já está inativo, pulando...`)
        continue
      }

      // Aplicar inativação
      await User.findByIdAndUpdate(student.userId, {
        $set: {
          'combined.status': 'INACTIVE',
          'hotmart.status': 'INACTIVE',
          // Guardar dados de inativação
          'inactivation.isManuallyInactivated': true,
          'inactivation.inactivatedAt': new Date(),
          'inactivation.inactivatedBy': 'Sistema - Expiração Automática',
          'inactivation.reason': student.expirationReason,
          'inactivation.platforms': ['hotmart'],
          'inactivation.classId': student.classId
        }
      })

      // Atualizar UserProduct (apenas Hotmart - expiração é de produto Hotmart)
      await UserProduct.updateMany(
        { userId: student.userId, platform: 'hotmart' },
        { $set: { status: 'INACTIVE' } }
      )

      // 🆕 REGISTRAR NO USERHISTORY
      try {
        const UserHistory = (await import('../../models/UserHistory')).default
        await UserHistory.create({
          userId: student.userId,
          userEmail: student.email,
          changeType: 'INACTIVATION',
          previousValue: { status: 'ACTIVE' },
          newValue: {
            status: 'INACTIVE',
            reason: student.expirationReason,
            daysSincePurchase: student.daysSincePurchase,
            purchaseDate: student.purchaseDate,
            classId: student.classId,
            className: student.className,
            accessEndOgi: student.accessEndOgi,
            expirationSource: student.expirationSource
          },
          platform: 'hotmart',
          action: 'update',
          changeDate: new Date(),
          source: 'SYSTEM',
          changedBy: 'Sistema - Expiração Automática',
          reason: `Expiração automática: ${student.expirationReason}`,
          metadata: {
            expirationType: 'automatic',
            expirationSource: student.expirationSource,
            daysSincePurchase: student.daysSincePurchase,
            expirationLimit: EXPIRATION_DAYS,
            purchaseDate: student.purchaseDate,
            accessEndOgi: student.accessEndOgi
          }
        })
      } catch (error: unknown) {
        console.warn(`   ⚠️ Erro ao registrar histórico de expiração para ${student.email}:`, errorMessage(error))
      }

      result.totalInactivated++

      // Rastrear turma afetada
      if (student.classId) {
        const count = classesWithExpiredStudents.get(student.classId) || 0
        classesWithExpiredStudents.set(student.classId, count + 1)
      }

      console.log(`   ✅ ${student.email} inativado (${student.expirationReason})`)

    } catch (error: unknown) {
      result.errors.push(`Erro ao inativar ${student.email}: ${errorMessage(error)}`)
      console.error(`   ❌ Erro ao inativar ${student.email}:`, errorMessage(error))
    }
  }

  // Atualizar turmas que ficaram sem alunos ativos
  for (const [classId, expiredCount] of classesWithExpiredStudents) {
    try {
      // Contar quantos alunos ativos restam na turma
      const activeCount = await User.countDocuments({
        $or: [
          { classId, 'combined.status': 'ACTIVE' },
          { 'hotmart.enrolledClasses.classId': classId, 'combined.status': 'ACTIVE' }
        ]
      })

      result.classesAffected.push(classId)

      // Se não há mais alunos ativos, inativar a turma
      if (activeCount === 0) {
        await Class.findOneAndUpdate(
          { classId },
          {
            $set: {
              isActive: false,
              estado: 'inativo',
              description: `Inativada automaticamente em ${new Date().toISOString()} - Todos os alunos expiraram`
            }
          }
        )
        console.log(`   📦 Turma ${classId} marcada como inativa (0 alunos ativos)`)
      } else {
        // Atualizar contagem de alunos
        await Class.findOneAndUpdate(
          { classId },
          { $set: { studentCount: activeCount } }
        )
        debugLog(`   📊 Turma ${classId}: ${activeCount} alunos ativos restantes`)
      }
    } catch (error: unknown) {
      result.errors.push(`Erro ao atualizar turma ${classId}: ${errorMessage(error)}`)
    }
  }

  console.log(`\n✅ [ExpirationCheck] Processamento concluído:`)
  console.log(`   📊 Total processados: ${result.totalProcessed}`)
  console.log(`   ✅ Total inativados: ${result.totalInactivated}`)
  console.log(`   📦 Turmas afetadas: ${result.classesAffected.length}`)
  if (result.errors.length > 0) {
    console.log(`   ❌ Erros: ${result.errors.length}`)
  }

  return result
}


// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  executeUniversalSync
}
