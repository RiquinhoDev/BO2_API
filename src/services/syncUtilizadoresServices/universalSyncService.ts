// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/universalSync.service.ts
// Service: Universal Sync - Unifica Manual + Automático
// ✅ VERSÃO FINAL: Escalável, flexível, sem hardcodes
// ════════════════════════════════════════════════════════════

import syncReportsService from './syncReports.service'
import SyncHistory from '../../models/SyncModels/SyncHistory'
import User, { IUser } from '../../models/user'
import type { SyncType, TriggerType } from '../../models/SyncModels/SyncReport'
import mongoose, { type UpdateQuery } from 'mongoose'
import { Product, UserProduct } from '../../models'
import { Class, type IClass } from '../../models/Class'
import type { IClassEnrollment, IEngagement, IProgress, IUserProduct } from '../../models/UserProduct'
import { ProcessItemResult, SyncError, SyncWarning, UniversalSourceItem, UniversalSyncConfig, UniversalSyncResult } from '../../types/universalSync.types'
import { snapshotAndCompare } from '../snapshotServices/userSnapshot.service'
import { planClassEnrollmentRole } from './classEnrollmentRole'
import {
  createUniversalSnapshotContext,
  type UniversalSnapshotContext,
} from './universalSyncSnapshot'
import { getRuntimeConfig } from '../../config/runtimeConfig'
import {
  errorMessage,
  getDocId,
  mongoErrorCode,
  normalizeEmail,
  toDateOrNull,
  toNumber,
} from './universalSync/fieldUtils'
import { productsCache, type LeanProduct } from './universalSync/productsCache'
import {
  EXPIRATION_DAYS,
  HotmartExpirationPolicy,
  formatDateOnly,
  getActiveHotmartClassForExpiration,
} from './universalSync/hotmartExpiration'
import { ExpiredStudentsCollector } from './universalSync/expiredStudentsCollector'
import { calculateEngagementMetricsForUserProduct } from './universalSync/engagement/engagementMetrics'
import { buildHotmartMutationPlan, hotmartPlanToUpdateFields, type HotmartClassEnrollment } from './universalSync/builders/hotmartMutationPlan'
import { buildCurseducaMutationPlan, curseducaPlanToUpdateFields } from './universalSync/builders/curseducaMutationPlan'

export { calculateEngagementMetricsForUserProduct } from './universalSync/engagement/engagementMetrics'

export { clearProductsCache } from './universalSync/productsCache'

const expirationPolicy = new HotmartExpirationPolicy({ now: () => new Date() })

// ═══════════════════════════════════════════════════════════
// TYPE HELPERS
// ═══════════════════════════════════════════════════════════


interface NewUserProductInput {
  userId: string
  productId: mongoose.Types.ObjectId
  platform: IUserProduct['platform']
  platformUserId: string
  platformUserUuid?: string
  status: IUserProduct['status']
  source: IUserProduct['source']
  enrolledAt: Date
  isPrimary: boolean
  progress: IProgress
  engagement: IEngagement
  platformData?: Record<string, unknown>
  classes: IClassEnrollment[]
  metadata?: IUserProduct['metadata']
}

function debugLog(...args: unknown[]) {
  if (getRuntimeConfig().observability.logLevel === 'debug') {
    console.log(...args)
  }
}


// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════


export const buildCanonicalActiveUserStatusUpdate = () => ({
  'combined.status': 'ACTIVE',
  'hotmart.status': 'ACTIVE',
  'curseduca.memberStatus': 'ACTIVE',
})

// ═══════════════════════════════════════════════════════════
// ✅ NOVO: MAPEAMENTO DINÂMICO DE PRODUTOS (COM CACHE!)
// ═══════════════════════════════════════════════════════════

/**
 * Determina o produto correto baseado nos dados do item e na plataforma
 * ✅ OTIMIZADO: Usa cache quando disponível
 */
async function determineProductId(
  item: UniversalSourceItem,
  syncType: SyncType
): Promise<mongoose.Types.ObjectId | null> {

  // ✅ Usar cache se disponível
  const useCache = productsCache.isLoaded()

  if (syncType === 'hotmart') {
    const productCode = item.productCode || 'OGI_V1'

    // Cache lookup
    if (useCache) {
      const cached = productsCache.get(`hotmart:${productCode}`) || productsCache.get(productCode)
      if (cached) {
        debugLog(`✅ [ProductMapping] Produto Hotmart do cache: ${productCode}`)
        return cached._id
      }
    }

    // Fallback: query BD
    const product = await Product.findOne({
      code: productCode,
      platform: 'hotmart',
      isActive: true
    }).select('_id').lean() as LeanProduct | null

    if (!product) {
      console.warn(`⚠️ [ProductMapping] Produto Hotmart não encontrado: ${productCode}`)
    }

    return product?._id || null
  }

  if (syncType === 'curseduca') {
    const groupId = String(item.groupId || '')

    if (groupId) {
      // Cache lookup por groupId
      if (useCache) {
        const cached = productsCache.get(`group_${groupId}`)
        if (cached) {
          debugLog(`✅ [ProductMapping] Produto CursEduca do cache (groupId ${groupId}): ${cached.code}`)
          return cached._id
        }
      }

      // Fallback: query BD
      const product = await Product.findOne({
        platform: 'curseduca',
        curseducaGroupId: groupId,
        isActive: true
      }).select('_id code').lean() as LeanProduct | null

      if (product) {
        debugLog(`✅ [ProductMapping] Produto encontrado por groupId ${groupId}: ${product.code}`)
        return product._id
      }
    }

    // 2ª tentativa: subscriptionType
    if (item.subscriptionType) {
      const productCode =
        item.subscriptionType === 'MONTHLY' ? 'CLAREZA_MENSAL' :
        item.subscriptionType === 'ANNUAL' ? 'CLAREZA_ANUAL' :
        null

      if (productCode) {
        // Cache lookup
        if (useCache) {
          const cached = productsCache.get(productCode)
          if (cached) {
            debugLog(`✅ [ProductMapping] Produto do cache (subscriptionType): ${productCode}`)
            return cached._id
          }
        }

        // Fallback: query BD
        const product = await Product.findOne({
          platform: 'curseduca',
          code: productCode,
          isActive: true
        }).select('_id code').lean() as LeanProduct | null

        if (product) {
          debugLog(`✅ [ProductMapping] Produto encontrado por subscriptionType ${item.subscriptionType}: ${product.code}`)
          return product._id
        }

        console.warn(`⚠️ [ProductMapping] Produto não encontrado para subscriptionType: ${item.subscriptionType} (${productCode})`)
      }
    }

    // 3ª tentativa: groupName (não usa cache - query dinâmica)
    if (item.groupName) {
      const product = await Product.findOne({
        platform: 'curseduca',
        name: { $regex: new RegExp(item.groupName, 'i') },
        isActive: true
      }).select('_id code').lean() as LeanProduct | null

      if (product) {
        console.log(`✅ [ProductMapping] Produto encontrado por groupName "${item.groupName}": ${product.code}`)
        return product._id
      }
    }

    // 4ª tentativa: default
    if (useCache) {
      const allCurseduca = Array.from(productsCache.values()).find(p => p.platform === 'curseduca')
      if (allCurseduca) {
        console.warn(`⚠️ [ProductMapping] Usando produto default CursEDuca: ${allCurseduca.code} (groupId: ${groupId})`)
        return allCurseduca._id
      }
    }

    const defaultProduct = await Product.findOne({
      platform: 'curseduca',
      isActive: true
    }).select('_id code').lean() as LeanProduct | null

    if (defaultProduct) {
      console.warn(`⚠️ [ProductMapping] Usando produto default CursEDuca: ${defaultProduct.code} (groupId: ${groupId})`)
      return defaultProduct._id
    }

    console.error(`❌ [ProductMapping] Nenhum produto CursEDuca ativo encontrado!`)
    return null
  }

  if (syncType === 'discord') {
    // Cache lookup
    if (useCache) {
      const cached = productsCache.get('DISCORD_COMMUNITY') ||
                     Array.from(productsCache.values()).find(p => p.platform === 'discord')
      if (cached) {
        debugLog(`✅ [ProductMapping] Produto Discord do cache: ${cached.code}`)
        return cached._id
      }
    }

    // Fallback: query BD
    const product = await Product.findOne({
      $or: [
        { code: 'DISCORD_COMMUNITY' },
        { platform: 'discord', isActive: true }
      ]
    }).select('_id code').lean() as LeanProduct | null

    if (!product) {
      console.warn(`⚠️ [ProductMapping] Produto Discord não encontrado`)
    }

    return product?._id || null
  }

  return null
}

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
// 🆕 NOVO: DETETAR RENOVAÇÕES DE UTILIZADORES INATIVADOS
// ═══════════════════════════════════════════════════════════

interface RenewalDetectionResult {
  wasInactivated: boolean
  shouldReactivate: boolean
  reactivationReason?: string
  inactivatedAt?: Date
  purchaseDate?: Date
}

/**
 * Deteta se um utilizador foi inativado manualmente e se renovou a subscrição
 * Compara a data de compra com a data de inativação
 */
async function detectRenewal(
  user: IUser,
  purchaseDate: Date | null,
  config: UniversalSyncConfig
): Promise<RenewalDetectionResult> {
  const result: RenewalDetectionResult = {
    wasInactivated: false,
    shouldReactivate: false
  }

  // Só para Hotmart (turma OGI e purchaseDate são dados desta plataforma)
  if (config.syncType !== 'hotmart') {
    return result
  }

  const activeClass = getActiveHotmartClassForExpiration(user)
  const expiration = expirationPolicy.evaluate(purchaseDate, activeClass?.className)
  if (!expiration.canEvaluate) {
    return result
  }

  const isInactiveInDB = user.combined?.status === 'INACTIVE'

  if (purchaseDate) {
    result.purchaseDate = purchaseDate
  }

  if (isInactiveInDB && !expiration.isExpired) {
    // Está inativo na BD mas o acesso ainda é válido → renovou ou foi inativado indevidamente
    result.wasInactivated = true
    result.shouldReactivate = true
    result.reactivationReason = 'sync'
    console.log(`🔄 [RenewalDetection] REATIVAÇÃO AUTOMÁTICA!`)
    console.log(`   📧 User: ${user.email}`)
    if (expiration.accessEndOgi) {
      console.log(`   📅 Acesso OGI: válido até ${formatDateOnly(expiration.accessEndOgi)} (${activeClass?.className || 'turma sem nome'})`)
    } else if (purchaseDate) {
      console.log(`   💳 Purchase: ${purchaseDate.toISOString().split('T')[0]} (${expiration.daysSincePurchase} dias, limite ${EXPIRATION_DAYS})`)
    }
  }

  return result
}

/**
 * Aplica a reativação automática de um utilizador que renovou
 */
async function applyAutoReactivation(
  userId: string,
  userEmail: string,
  renewalResult: RenewalDetectionResult
): Promise<void> {
  console.log(`✅ [AutoReactivation] Reativando ${userEmail}...`)

  // 1. Atualizar User
  await User.findByIdAndUpdate(userId, {
    $set: {
      ...buildCanonicalActiveUserStatusUpdate(),
      // Atualizar dados de inativação
      'inactivation.isManuallyInactivated': false,
      'inactivation.reactivatedAt': new Date(),
      'inactivation.reactivatedBy': 'Sistema - Sync Automático',
      'inactivation.reactivationReason': renewalResult.reactivationReason
    }
  })

  // 2. Atualizar UserProduct
  await UserProduct.updateMany(
    { userId },
    { $set: { status: 'ACTIVE' } }
  )

  // Nota (2026-07-11): a chamada legacy ao Discord (`${DISCORD_BOT_URL}/add-roles`)
  // foi removida — esse endpoint nunca existiu no repo API (o fetch levava 404 e o log
  // "Roles restaurados" era falso). Os cargos R.* de renovação são reconciliados de
  // noite pelo DiscordRolesSync.

  console.log(`✅ [AutoReactivation] ${userEmail} reativado com sucesso!`)
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
// ✅ NOVO: GARANTIR QUE TURMA EXISTE NA TABELA CLASS
// ═══════════════════════════════════════════════════════════

/**
 * Cria ou atualiza uma turma na tabela Class
 * Chamado durante o sync para garantir que todas as turmas são registadas
 */
// Devolve o nome real da turma (da BD) após criar/actualizar
async function ensureClassExists(
  classId: string,
  className: string | undefined,
  source: 'hotmart' | 'curseduca',
  curseducaId?: string,
  curseducaUuid?: string
): Promise<string> {
  if (!classId) return className || `Turma ${classId}`

  try {
    const existingClass = await Class.findOne({ classId })

    if (!existingClass) {
      const displayName = className || `Turma ${classId}`

      await Class.create({
        classId,
        name: displayName,
        curseducaId: source === 'curseduca' ? curseducaId : undefined,
        curseducaUuid: source === 'curseduca' ? curseducaUuid : undefined,
        source: source === 'hotmart' ? 'hotmart_sync' : 'curseduca_sync',
        isActive: true,
        estado: 'ativo',
        studentCount: 1,
        lastSyncAt: new Date()
      })

      console.log(`   ✅ [Class] Nova turma criada: ${classId} - "${displayName}"`)
      return displayName

    } else {
      const updates: UpdateQuery<IClass> = {
        lastSyncAt: new Date(),
        $inc: { studentCount: 0 }
      }

      const isGenericName = existingClass.name.match(/^Turma [a-zA-Z0-9]+$/)
      const hasNewName = className && className !== existingClass.name && !className.match(/^Turma [a-zA-Z0-9]+$/)

      if (isGenericName && hasNewName) {
        updates.name = className
        console.log(`   📝 [Class] Nome atualizado: ${classId} - "${existingClass.name}" → "${className}"`)
      }

      if (source === 'curseduca') {
        if (curseducaId && !existingClass.curseducaId) updates.curseducaId = curseducaId
        if (curseducaUuid && !existingClass.curseducaUuid) updates.curseducaUuid = curseducaUuid
      }

      await Class.findByIdAndUpdate(existingClass._id, updates)
      // Devolver o nome real da BD (que pode ter sido editado manualmente)
      return (isGenericName && hasNewName ? className : existingClass.name) || `Turma ${classId}`
    }
  } catch (error: unknown) {
    if (mongoErrorCode(error) !== 11000) {
      console.error(`   ⚠️ [Class] Erro ao criar/atualizar turma ${classId}:`, errorMessage(error))
    }
    return className || `Turma ${classId}`
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: PROCESS SINGLE ITEM
// ═══════════════════════════════════════════════════════════

const processSyncItem = async (
  item: UniversalSourceItem,
  config: UniversalSyncConfig,
  snapshotContext: UniversalSnapshotContext,
  expiredCollector: ExpiredStudentsCollector,
): Promise<ProcessItemResult> => {
  // ═══════════════════════════════════════════════════════════
  // VALIDAÇÃO INICIAL
  // ═══════════════════════════════════════════════════════════
  if (!item.email || !item.email.trim()) {
    throw new Error('Item sem email')
  }

  const email = normalizeEmail(item.email)
  const name = item.name && item.name.trim() ? item.name.trim() : email

  // ═══════════════════════════════════════════════════════════
  // BUSCAR OU CRIAR USER
  // ═══════════════════════════════════════════════════════════
  let user = await User.findOne({ email })
  const isNew = !user

  if (!user) {
    user = await User.create({
      email,
      name
    })
    console.log(`✨ [UniversalSync] Novo user criado: ${user.email}`)
  }

  const userIdStr = String(user._id)

  // ═══════════════════════════════════════════════════════════
  // PREPARAR UPDATES DO USER
  // ═══════════════════════════════════════════════════════════
  const updateFields: Record<string, unknown> = {}
  let pendingHotmartClasses: HotmartClassEnrollment[] | undefined
  let needsUpdate = false

  if (name && user.name !== name) {
    updateFields.name = name
    needsUpdate = true
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ HOTMART - VERSÃO COMPLETA (MANTÉM TUDO!)
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'hotmart') {
    // PREPARE: resolve the real class (ensureClassExists stays out of the pure builder).
    const resolvedClass = item.classId
      ? { classId: item.classId, className: await ensureClassExists(item.classId, item.className, 'hotmart') }
      : undefined

    // PURE BUILDER: item + current user state + resolved class -> explicit plan (no I/O).
    const plan = buildHotmartMutationPlan({
      item,
      user: {
        classId: user.classId,
        hotmart: { enrolledClasses: user.hotmart?.enrolledClasses },
        curseduca: { enrolledClasses: user.curseduca?.enrolledClasses },
      },
      isNew,
      resolvedClass,
      clock: { now: () => new Date() },
    })

    // EXECUTOR: apply the plan's field changes onto updateFields.
    Object.assign(updateFields, hotmartPlanToUpdateFields(plan))
    if (plan.needsUpdate) needsUpdate = true
    // Expose the pending classes to the post-branch expiration check (shared contract).
    pendingHotmartClasses = plan.hotmart.enrolledClasses

    // EXECUTOR: class-history side effect (non-fatal), driven by the plan event.
    if (plan.classHistoryEvent) {
      const ev = plan.classHistoryEvent
      try {
        const StudentClassHistory = (await import('../../models/StudentClassHistory')).default
        if (ev.type === 'class-changed') {
          await StudentClassHistory.create({
            studentId: user._id,
            classId: ev.classId,
            className: ev.className,
            previousClassId: ev.previousClassId,
            previousClassName: ev.previousClassName,
            dateMoved: ev.dateMoved,
            reason: 'Mudança detectada no sync Hotmart',
            movedBy: 'Sistema - Sync Automático'
          })
          console.log(`   📝 [ClassChange] ${user.email}: "${ev.previousClassName}" → "${ev.className}"`)
        } else {
          await StudentClassHistory.create({
            studentId: user._id,
            classId: ev.classId,
            className: ev.className,
            dateMoved: ev.dateMoved,
            reason: 'Primeira inscrição na turma (data de compra)',
            movedBy: 'Sistema - Sync Automático'
          })
          console.log(`   ✨ [FirstEnrollment] ${user.email} inscrito em "${ev.className}"`)
        }
      } catch (error: unknown) {
        console.warn(`   ⚠️ Erro ao registrar histórico de turma para ${user.email}:`, errorMessage(error))
      }
    }

    // EXECUTOR: sync timestamps stamped AFTER the history effect (temporal order).
    const hotmartSyncAt = new Date()
    updateFields['hotmart.lastSyncAt'] = hotmartSyncAt
    updateFields['metadata.updatedAt'] = hotmartSyncAt
    updateFields['metadata.sources.hotmart.lastSync'] = hotmartSyncAt
  }

// ═══════════════════════════════════════════════════════════
// ✅ CURSEDUCA - VERSÃO COMPLETA COM TODOS OS CAMPOS NOVOS
// ═══════════════════════════════════════════════════════════
  if (config.syncType === 'curseduca') {
    // PREPARE: ensure the group's class exists (side effect only; groupId is the classId, never the student uuid).
    if (item.groupId) {
      await ensureClassExists(String(item.groupId), item.groupName, 'curseduca', String(item.groupId), undefined)
    }

    // PURE BUILDER: item + current user state -> explicit plan (no I/O).
    const plan = buildCurseducaMutationPlan({
      item,
      user: {
        hotmart: { enrolledClasses: user.hotmart?.enrolledClasses },
        curseduca: { curseducaUserId: user.curseduca?.curseducaUserId, enrolledClasses: user.curseduca?.enrolledClasses },
      },
      clock: { now: () => new Date() },
    })

    // EXECUTOR: apply the plan's field changes onto updateFields.
    Object.assign(updateFields, curseducaPlanToUpdateFields(plan))
    if (plan.needsUpdate) needsUpdate = true

    // EXECUTOR: reconcile a PARA_INATIVAR userproduct when the member is inactive
    // (read + write kept together, non-fatal), matching the original flow.
    if (plan.reconcileParaInativar) {
      try {
        const userProductToUpdate = await UserProduct.findOne({
          userId: userIdStr,
          platform: 'curseduca',
          status: 'PARA_INATIVAR'
        })

        if (userProductToUpdate) {
          await UserProduct.findByIdAndUpdate(userProductToUpdate._id, {
            $set: {
              status: 'INACTIVE',
              'metadata.inactivatedAt': new Date(),
              'metadata.inactivatedBy': 'curseduca_sync_auto',
              'metadata.inactivatedReason': 'Já estava INACTIVE no CursEduca durante sync'
            },
            $unset: {
              'metadata.markedForInactivationAt': 1,
              'metadata.markedForInactivationReason': 1
            }
          })
          debugLog(`   ✅ [CursEduca Sync] Removido de PARA_INATIVAR (já INACTIVE): ${user.email}`)
        }
      } catch (err: unknown) {
        console.error(`⚠️ [CursEduca Sync] Erro ao atualizar UserProduct para ${user.email}:`, errorMessage(err))
      }
    }

    // EXECUTOR: sync timestamps stamped AFTER the reconcile effect (temporal order).
    const curseducaSyncAt = new Date()
    updateFields['curseduca.lastSyncAt'] = curseducaSyncAt
    updateFields['metadata.updatedAt'] = curseducaSyncAt
    updateFields['metadata.sources.curseduca.lastSync'] = curseducaSyncAt
  }

  // ═══════════════════════════════════════════════════════════
  // DISCORD - Schema Segregado
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'discord') {
    if (item.discordUserId) {
      updateFields['discord.discordIds'] = [item.discordUserId]
      needsUpdate = true
    }

    if (item.username) {
      updateFields['discord.username'] = item.username
      needsUpdate = true
    }

    if (item.roles) {
      updateFields['discord.roles'] = item.roles
      needsUpdate = true
    }

    updateFields['discord.lastSyncAt'] = new Date()
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.discord.lastSync'] = new Date()
    needsUpdate = true
  }

  // ═══════════════════════════════════════════════════════════
  // 🆕 DETETAR RENOVAÇÕES (antes de aplicar updates)
  // ═══════════════════════════════════════════════════════════
  const purchaseDate = toDateOrNull(item.purchaseDate)
  const renewalResult = await detectRenewal(user, purchaseDate, config)

  if (renewalResult.shouldReactivate) {
    // Utilizador renovou! Aplicar reativação automática
    await applyAutoReactivation(userIdStr, user.email, renewalResult)
  }

  // ═══════════════════════════════════════════════════════════
  // 🔥 FIX: Reativar se compra recente mas status = INACTIVE
  // detectRenewal só corre quando isManuallyInactivated=true.
  // Se isManuallyInactivated=false mas status ainda está INACTIVE
  // (e a compra não está expirada), reativar User + UserProduct.
  // ═══════════════════════════════════════════════════════════
  if (
    config.syncType === 'hotmart' &&
    !renewalResult.shouldReactivate
  ) {
    const isInactiveInDB = user.combined?.status === 'INACTIVE'
    const activeHotmartClass = getActiveHotmartClassForExpiration(
      user,
      pendingHotmartClasses,
      item.classId,
      item.className
    )
    const expiration = expirationPolicy.evaluate(
      purchaseDate,
      activeHotmartClass?.className
    )

    if (isInactiveInDB && expiration.canEvaluate && !expiration.isExpired) {
      const validUntil = expiration.accessEndOgi
        ? `acesso válido até ${formatDateOnly(expiration.accessEndOgi)}`
        : `compra recente (${expiration.daysSincePurchase}d)`
      console.log(`   🔄 [AutoFix] ${user.email} está INACTIVE mas tem ${validUntil} → reativando`)
      Object.assign(updateFields, buildCanonicalActiveUserStatusUpdate())
      updateFields['inactivation.isManuallyInactivated'] = false
      updateFields['inactivation.reactivatedAt'] = new Date()
      updateFields['inactivation.reactivatedBy'] = 'Sistema - Sync Automático (compra recente)'
      needsUpdate = true

      // Também reativar UserProduct (apenas Hotmart - CursEduca é gerido pelo Guru)
      await UserProduct.updateMany(
        { userId: userIdStr, platform: 'hotmart', status: { $in: ['INACTIVE', 'PARA_INATIVAR'] } },
        { $set: { status: 'ACTIVE' } }
      )
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🆕 VERIFICAR EXPIRAÇÃO REAL DA TURMA - só para Hotmart
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'hotmart' && !renewalResult.shouldReactivate) {
    const activeHotmartClass = getActiveHotmartClassForExpiration(
      user,
      pendingHotmartClasses,
      item.classId,
      item.className
    )
    const expiredStudent = expirationPolicy.check(
      userIdStr,
      user.email,
      user.name,
      purchaseDate,
      activeHotmartClass?.classId || item.classId,
      activeHotmartClass?.className || item.className
    )

    if (expiredStudent) {
      // Adicionar à lista para processar no final do sync
      expiredCollector.add(expiredStudent)
      debugLog(`   ⏰ [Expiration] ${user.email} marcado para inativação (${expiredStudent.expirationReason})`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // APLICAR UPDATES NO USER
  // ═══════════════════════════════════════════════════════════
  if (needsUpdate) {
    await User.findByIdAndUpdate(userIdStr, { $set: updateFields })
    debugLog(`🔄 [UniversalSync] User atualizado: ${user.email}`)
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ CRIAR/ATUALIZAR USERPRODUCT AUTOMATICAMENTE
  // ═══════════════════════════════════════════════════════════
  
  try {
    // 1. Determinar productId usando função escalável
    const productId = await determineProductId(item, config.syncType)
    
    if (!productId) {
      console.warn(`⚠️ [UniversalSync] Produto não encontrado para ${config.syncType} - user: ${user.email}`)
      return { 
        action: isNew ? 'inserted' : (needsUpdate ? 'updated' : 'unchanged'), 
        userId: userIdStr 
      }
    }
    
    // 2. Verificar se UserProduct já existe
    const existingUP = await UserProduct.findOne({
      userId: userIdStr,
      productId: productId
    })
    
    // ═══════════════════════════════════════════════════════════
    // CASO 1: ATUALIZAR USERPRODUCT EXISTENTE
    // ═══════════════════════════════════════════════════════════
    if (existingUP) {
      const upUpdateFields: Record<string, unknown> = {}
      let upNeedsUpdate = false
      
      // isPrimary
      if (item.platformData?.isPrimary !== undefined) {
        debugLog(`   📌 Atualizando isPrimary: ${item.platformData.isPrimary} para ${item.email}`)
        upUpdateFields['isPrimary'] = item.platformData.isPrimary
        upNeedsUpdate = true
      }
      
      // ═══════════════════════════════════════════════════════════
      // PROGRESS - Atualizar todos os campos disponíveis por plataforma
      // ═══════════════════════════════════════════════════════════
      if (item.progress?.percentage !== undefined) {
        const newPercentage = toNumber(item.progress.percentage, 0)
        if (existingUP.progress?.percentage !== newPercentage) {
          upUpdateFields['progress.percentage'] = newPercentage
          upUpdateFields['progress.lastActivity'] = toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
          upNeedsUpdate = true
        }
      }

      // 🔥 HOTMART - Campos específicos de progresso
      if (config.syncType === 'hotmart') {
        // currentModule
        if (item.currentModule !== undefined) {
          upUpdateFields['progress.currentModule'] = toNumber(item.currentModule, 0)
          upNeedsUpdate = true
        }

        // ✅ CONTADORES DE LIÇÕES (completed/total)
        if (item.progress?.completed !== undefined) {
          upUpdateFields['progress.completed'] = toNumber(item.progress.completed, 0)
          upNeedsUpdate = true
        }
        if (item.progress?.total !== undefined) {
          upUpdateFields['progress.total'] = toNumber(item.progress.total, 0)
          upNeedsUpdate = true
        }

        // lessonsCompleted - array de pageIds das aulas completadas
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          const completedLessons = item.progress.lessons
            .flatMap(l => l.isCompleted && l.pageId ? [l.pageId] : [])

          if (completedLessons.length > 0) {
            upUpdateFields['progress.lessonsCompleted'] = completedLessons
            upNeedsUpdate = true
          }
        }

        // modulesCompleted - extrair módulos únicos das aulas completadas
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          const completedModules = [...new Set(
            item.progress.lessons
              .flatMap(l => l.isCompleted && l.moduleName ? [l.moduleName] : [])
          )]

          if (completedModules.length > 0) {
            upUpdateFields['progress.modulesCompleted'] = completedModules
            upNeedsUpdate = true
          }
        }

        // ✅ MÓDULOS - Lista completa com detalhes
        if (item.progress?.modulesList && Array.isArray(item.progress.modulesList)) {
          upUpdateFields['progress.modulesList'] = item.progress.modulesList
          upNeedsUpdate = true
        }

        // ✅ MÓDULOS - Total de módulos
        if (item.progress?.totalModules !== undefined) {
          upUpdateFields['progress.totalModules'] = toNumber(item.progress.totalModules, 0)
          upNeedsUpdate = true
        }
      }
      
      // ═══════════════════════════════════════════════════════════
      // ENGAGEMENT - Score e campos básicos
      // ═══════════════════════════════════════════════════════════
      if (item.engagement?.engagementScore !== undefined) {
        const newScore = toNumber(item.engagement.engagementScore, 0)
        if (existingUP.engagement?.engagementScore !== newScore) {
          upUpdateFields['engagement.engagementScore'] = newScore
          const lastActionDate = toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
          upUpdateFields['engagement.lastAction'] = lastActionDate
          // Calcular daysInactive
          const now = new Date()
          const daysInactive = Math.floor((now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24))
          upUpdateFields['engagement.daysInactive'] = Math.max(0, daysInactive)
          upNeedsUpdate = true
        }
      } else if (item.accessCount !== undefined) {
        const newScore = toNumber(item.accessCount, 0)
        if (existingUP.engagement?.engagementScore !== newScore) {
          upUpdateFields['engagement.engagementScore'] = newScore
          const lastActionDate = toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
          upUpdateFields['engagement.lastAction'] = lastActionDate
          // Calcular daysInactive
          const now = new Date()
          const daysInactive = Math.floor((now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24))
          upUpdateFields['engagement.daysInactive'] = Math.max(0, daysInactive)
          upNeedsUpdate = true
        }
      }

      // 🔥 HOTMART - Engagement baseado em logins
      if (config.syncType === 'hotmart') {
        if (item.accessCount !== undefined) {
          upUpdateFields['engagement.totalLogins'] = toNumber(item.accessCount, 0)
          upNeedsUpdate = true
        }

        if (item.lastAccessDate) {
          upUpdateFields['engagement.lastLogin'] = toDateOrNull(item.lastAccessDate)
          upNeedsUpdate = true
        }
      }

      // 🎓 CURSEDUCA - Engagement baseado em ações
      if (config.syncType === 'curseduca') {
        if (item.lastLogin) {
          const lastActionDate = toDateOrNull(item.lastLogin)
          upUpdateFields['engagement.lastAction'] = lastActionDate
          // Calcular daysInactive
          if (lastActionDate) {
            const now = new Date()
            const daysInactive = Math.floor((now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24))
            upUpdateFields['engagement.daysInactive'] = Math.max(0, daysInactive)
          }
          upNeedsUpdate = true
        }
        if (item.accessCount !== undefined) {
          upUpdateFields['engagement.totalLogins'] = toNumber(item.accessCount, 0)
          upNeedsUpdate = true
        }
      }

      if (item.platformData) {
        upUpdateFields['platformData'] = item.platformData
        upNeedsUpdate = true
      }

      // ═══════════════════════════════════════════════════════════
      // 🚨 CRÍTICO: CLASSES - Popular array de turmas
      // ═══════════════════════════════════════════════════════════
      const classId = config.syncType === 'hotmart'
        ? item.classId
        : config.syncType === 'curseduca'
          ? String(item.groupId)
          : null

      if (classId) {
        const enrollmentDate = toDateOrNull(item.enrolledAt) ||
                              toDateOrNull(item.purchaseDate) ||
                              toDateOrNull(item.joinedDate) ||
                              new Date()
        const rolePlan = planClassEnrollmentRole(
          existingUP.classes || [],
          classId,
          item.role
        )

        // Verificar se a turma já existe no array
        const existingClassIndex = existingUP.classes?.findIndex(c => c.classId === classId) ?? -1

        if (existingClassIndex === -1) {
          // Adicionar nova turma ao array (SEM className - virá da tabela Class)
          upUpdateFields['classes'] = [
            ...(existingUP.classes || []),
            {
              classId,
              role: rolePlan.role,
              joinedAt: enrollmentDate,
              leftAt: null
            }
          ]
          upNeedsUpdate = true
          console.log(`   📚 [Classes] Adicionada turma ${classId} para ${user.email}`)
        } else if (rolePlan.update) {
          upUpdateFields[rolePlan.update.path] = rolePlan.update.value
          upNeedsUpdate = true
        }
        // Não atualizamos className porque ele vem da tabela Class, não do sync
      }

      // ════════════════════════════════════════════════════════════
      // 🆕 SPRINT 1.5B: CALCULAR ENGAGEMENT METRICS (ATUALIZAR)
      // ════════════════════════════════════════════════════════════
      try {
        const product = await Product.findById(productId)
        
        if (product) {
          debugLog(`   📊 [Sprint 1.5B] Calculando engagement metrics para ${user.email}`)
          
          const metrics = calculateEngagementMetricsForUserProduct(user, product)
          
          // Engagement fields
          if (metrics.engagement.daysSinceLastLogin !== null) {
            upUpdateFields['engagement.daysSinceLastLogin'] = metrics.engagement.daysSinceLastLogin
            upNeedsUpdate = true
          }
          
          if (metrics.engagement.daysSinceLastAction !== null) {
            upUpdateFields['engagement.daysSinceLastAction'] = metrics.engagement.daysSinceLastAction
            upNeedsUpdate = true
          }
          
          if (metrics.engagement.totalLogins !== undefined) {
            upUpdateFields['engagement.totalLogins'] = metrics.engagement.totalLogins
            upNeedsUpdate = true
          }
          
          // Metadata fields
          if (metrics.metadata.purchaseDate !== null) {
            upUpdateFields['metadata.purchaseDate'] = metrics.metadata.purchaseDate
            upNeedsUpdate = true
          }
          
          if (metrics.metadata.platform) {
            upUpdateFields['metadata.platform'] = metrics.metadata.platform
            upNeedsUpdate = true
          }
          
          if (metrics.metadata.purchaseValue !== null) {
            upUpdateFields['metadata.purchaseValue'] = metrics.metadata.purchaseValue
            upNeedsUpdate = true
          }
          
          debugLog(`   ✅ [Sprint 1.5B] Engagement metrics calculados e adicionados`)
        }
      } catch (metricsError: unknown) {
        console.error(`   ❌ [Sprint 1.5B] Erro ao calcular engagement metrics:`, errorMessage(metricsError))
      }
      
      // Nota: PARA_INATIVAR não é revertido pelo sync.
      // É uma decisão de admin (via markDiscrepanciesForInactivation, que já valida a Guru API).
      // Apenas revertInactivationMark o pode desfazer manualmente.

      // Aplicar updates
      if (upNeedsUpdate) {
        await UserProduct.findByIdAndUpdate(existingUP._id, { $set: upUpdateFields })
        debugLog(`   📦 UserProduct atualizado: ${user.email}`)
      }
      
    // ═══════════════════════════════════════════════════════════
    // CASO 2: CRIAR USERPRODUCT NOVO
    // ═══════════════════════════════════════════════════════════
    } else {
      const enrolledAt = toDateOrNull(item.enrolledAt) || 
                        toDateOrNull(item.purchaseDate) ||
                        toDateOrNull(item.joinedDate) ||
                        new Date()
      
      // isPrimary logic
      let isPrimaryValue = item.platformData?.isPrimary ?? true
      
      if (config.syncType === 'curseduca' && isPrimaryValue === true) {
        const existingPrimary = await UserProduct.findOne({
          userId: userIdStr,
          platform: 'curseduca',
          productId: { $ne: productId },
          isPrimary: true
        })
        
        if (existingPrimary) {
          console.log(`   🛡️ [Proteção] User ${item.email} já tem produto PRIMARY`)
          
          const existingDate = existingPrimary.enrolledAt ? new Date(existingPrimary.enrolledAt).getTime() : 0
          const newDate = enrolledAt.getTime()
          
          if (newDate > existingDate) {
            console.log(`      ✅ Novo produto mais recente → PRIMARY, antigo → INACTIVE`)
            await UserProduct.updateOne(
              { _id: existingPrimary._id },
              {
                $set: {
                  isPrimary: false,
                  // Só inativar se ainda estiver ACTIVE ou PARA_INATIVAR — não tocar em já INACTIVE
                  ...((['ACTIVE', 'PARA_INATIVAR'].includes(existingPrimary.status)) && {
                    status: 'INACTIVE',
                    'metadata.inactivatedAt': new Date(),
                    'metadata.inactivatedReason': 'Substituído por novo plano no sync (mudança de plano)'
                  })
                }
              }
            )
          } else {
            console.log(`      🔻 Novo produto mais antigo → SECONDARY (antigo mantém-se PRIMARY)`)
            isPrimaryValue = false
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════════
      // 🚨 CRÍTICO: Preparar array de classes
      // ═══════════════════════════════════════════════════════════
      const classId = config.syncType === 'hotmart'
        ? item.classId
        : config.syncType === 'curseduca'
          ? String(item.groupId)
          : null
      const rolePlan = classId
        ? planClassEnrollmentRole([], classId, item.role)
        : {}

      // Não guardamos className no UserProduct - ele vem da tabela Class via lookup
      const classesArray: IClassEnrollment[] = classId ? [{
        classId,
        role: rolePlan.role,
        joinedAt: enrolledAt
      }] : []

      // ═══════════════════════════════════════════════════════════
      // Construir objeto progress por plataforma
      // ═══════════════════════════════════════════════════════════
      const progressObj: IProgress = {
        percentage: item.progress?.percentage ? toNumber(item.progress.percentage, 0) : 0,
        lastActivity: toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
      }

      // 🔥 HOTMART - Adicionar campos específicos
      if (config.syncType === 'hotmart') {
        if (item.currentModule !== undefined) {
          progressObj.currentModule = toNumber(item.currentModule, 0)
        }

        // ✅ CONTADORES DE LIÇÕES (completed/total)
        if (item.progress?.completed !== undefined) {
          progressObj.completed = toNumber(item.progress.completed, 0)
        }
        if (item.progress?.total !== undefined) {
          progressObj.total = toNumber(item.progress.total, 0)
        }

        // lessonsCompleted - array de pageIds
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          progressObj.lessonsCompleted = item.progress.lessons
            .flatMap(l => l.isCompleted && l.pageId ? [l.pageId] : [])
        }

        // modulesCompleted - array de módulos únicos
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          progressObj.modulesCompleted = [...new Set(
            item.progress.lessons
              .flatMap(l => l.isCompleted && l.moduleName ? [l.moduleName] : [])
          )]
        }
      }

      // ═══════════════════════════════════════════════════════════
      // Construir objeto engagement por plataforma
      // ═══════════════════════════════════════════════════════════
      const lastActionDate = toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
      const now = new Date()
      const daysInactive = Math.floor((now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24))

      const engagementObj: IEngagement = {
        engagementScore: item.engagement?.engagementScore
          ? toNumber(item.engagement.engagementScore, 0)
          : toNumber(item.accessCount, 0),
        lastAction: lastActionDate,
        daysInactive: Math.max(0, daysInactive)
      }

      // 🔥 HOTMART - Engagement baseado em logins
      if (config.syncType === 'hotmart') {
        if (item.accessCount !== undefined) {
          engagementObj.totalLogins = toNumber(item.accessCount, 0)
        }
        if (item.lastAccessDate) {
          engagementObj.lastLogin = toDateOrNull(item.lastAccessDate) || undefined
        }
      }

      // 🎓 CURSEDUCA - Engagement baseado em ações
      if (config.syncType === 'curseduca') {
        if (item.lastLogin) {
          const curseducaLastAction = toDateOrNull(item.lastLogin)
          engagementObj.lastAction = curseducaLastAction || undefined
          if (curseducaLastAction) {
            const curseducaDaysInactive = Math.floor((now.getTime() - curseducaLastAction.getTime()) / (1000 * 60 * 60 * 24))
            engagementObj.daysInactive = Math.max(0, curseducaDaysInactive)
          }
        }
        if (item.accessCount !== undefined) {
          engagementObj.totalLogins = toNumber(item.accessCount, 0)
        }
      }

      // ═══════════════════════════════════════════════════════════
      // Criar novo UserProduct com TODOS os campos
      // ═══════════════════════════════════════════════════════════
      const newUserProduct: NewUserProductInput = {
        userId: userIdStr,
        productId: productId,
        platform: config.syncType,
        platformUserId: item.curseducaUserId || item.hotmartUserId || item.discordUserId || userIdStr,
        platformUserUuid: item.curseducaUuid,  // Só Curseduca
        status: 'ACTIVE',
        source: 'PURCHASE',
        enrolledAt: enrolledAt,
        isPrimary: isPrimaryValue,

        progress: progressObj,
        engagement: engagementObj,
        platformData: item.platformData,
        classes: classesArray  // 🚨 CRÍTICO - Array de turmas
      }
      
      // ════════════════════════════════════════════════════════════
      // 🆕 SPRINT 1.5B: CALCULAR ENGAGEMENT METRICS (CRIAR)
      // ════════════════════════════════════════════════════════════
      try {
        const product = await Product.findById(productId)
        
        if (product) {
          console.log(`   📊 [Sprint 1.5B] Calculando engagement metrics para novo UserProduct: ${user.email}`)
          
          const metrics = calculateEngagementMetricsForUserProduct(user, product)
          
          // Adicionar engagement metrics
          newUserProduct.engagement = {
            ...newUserProduct.engagement,
            ...(metrics.engagement.daysSinceLastLogin !== null && {
              daysSinceLastLogin: metrics.engagement.daysSinceLastLogin
            }),
            ...(metrics.engagement.daysSinceLastAction !== null && {
              daysSinceLastAction: metrics.engagement.daysSinceLastAction
            }),
            totalLogins: metrics.engagement.totalLogins || 0
          }
          
          // Adicionar metadata
          if (!newUserProduct.metadata) {
            newUserProduct.metadata = {}
          }
          
          newUserProduct.metadata = {
            ...newUserProduct.metadata,
            ...(metrics.metadata.purchaseDate !== null && {
              purchaseDate: metrics.metadata.purchaseDate
            }),
            platform: metrics.metadata.platform,
            ...(metrics.metadata.purchaseValue !== null && {
              purchaseValue: metrics.metadata.purchaseValue
            })
          }
          
          console.log(`   ✅ [Sprint 1.5B] Engagement metrics adicionados ao novo UserProduct`)
        }
      } catch (metricsError: unknown) {
        console.error(`   ❌ [Sprint 1.5B] Erro ao calcular engagement metrics:`, errorMessage(metricsError))
      }
      
      // Dados específicos da plataforma
      await UserProduct.create(newUserProduct)
      debugLog(`   ✨ UserProduct CRIADO: ${user.email} → ${config.syncType}`)
    }
    
  } catch (upError: unknown) {
    console.error(`❌ [UniversalSync] Erro ao criar/atualizar UserProduct para ${user.email}:`, errorMessage(upError))
  }

  // ═══════════════════════════════════════════════════════════
  // 📸 SNAPSHOT E HISTÓRICO
  // ═══════════════════════════════════════════════════════════

  try {
    // Buscar todos os produtos do user APÓS atualização
    const userProducts = await UserProduct.find({ userId: user._id })
      .populate('productId', 'name code platform')

    // Criar snapshot, comparar com anterior e registar histórico
    const { comparison } = await snapshotAndCompare(
      user,
      userProducts,
      snapshotContext.syncType,
      snapshotContext.syncId,
    )

    if (comparison.hasChanges && comparison.summary.totalChanges > 1) {
      debugLog(`   📸 [Snapshot] ${comparison.summary.totalChanges} alterações registadas para ${user.email}`)
      debugLog(`      - HIGH: ${comparison.summary.highPriorityChanges}`)
      debugLog(`      - MEDIUM: ${comparison.summary.mediumPriorityChanges}`)
      debugLog(`      - LOW: ${comparison.summary.lowPriorityChanges}`)
    }
  } catch (snapshotError: unknown) {
    console.error(`⚠️  [Snapshot] Erro ao criar snapshot para ${user.email}:`, errorMessage(snapshotError))
    // Não falhar o sync por erro no snapshot
  }

  // ═══════════════════════════════════════════════════════════
  // RETORNAR RESULTADO
  // ═══════════════════════════════════════════════════════════

  return {
    action: isNew ? 'inserted' : (needsUpdate ? 'updated' : 'unchanged'),
    userId: userIdStr
  }
}

/**
 * 📊 CALCULAR ENGAGEMENT METRICS PARA USERPRODUCT
 * 
 * Calcula métricas específicas baseadas na plataforma do produto
 * 
 * REGRAS:
 * - Hotmart (OGI) = daysSinceLastLogin (login-based tracking)
 * - CursEduca (Clareza) = daysSinceLastAction (action-based tracking)
 * - purchaseValue/purchaseDate vêm da plataforma correspondente
 * 
 * USADO POR:
 * - Tag Rules (conditionEvaluator)
 * - Dashboard analytics
 * - CRON re-engagement
 */
// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  executeUniversalSync
}
