// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/universalSync.service.ts
// Service: Universal Sync - Unifica Manual + Automático
// ✅ VERSÃO FINAL: Escalável, flexível, sem hardcodes
// ════════════════════════════════════════════════════════════

import syncReportsService from './syncReports.service'
import SyncHistory from '../../models/SyncModels/SyncHistory'
import User, { IUser } from '../../models/user'
import type { SyncType, TriggerType } from '../../models/SyncModels/SyncReport'
import mongoose from 'mongoose'
import { Product, UserProduct } from '../../models'
import { Class } from '../../models/Class'
import { IProduct } from '../../models/product/Product'
import { ProcessItemResult, SyncError, SyncWarning, UniversalSourceItem, UniversalSyncConfig, UniversalSyncResult } from '../../types/universalSync.types'

// ═══════════════════════════════════════════════════════════
// TYPE HELPERS
// ═══════════════════════════════════════════════════════════

type LeanProduct = {
  _id: mongoose.Types.ObjectId
  code: string
  platform: string
  curseducaGroupId?: string
  platformData?: any
  name?: string
}
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

function debugLog(...args: any[]) {
  if (LOG_LEVEL === 'debug') {
    console.log(...args)
  }
}


// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const getDocId = (doc: unknown, label: string): string => {
  const d = doc as { _id?: unknown; id?: unknown }
  const raw = d?._id ?? d?.id

  if (raw === undefined || raw === null) {
    throw new Error(`${label} sem _id/id`)
  }

  return String(raw)
}

const toDateOrNull = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

// ═══════════════════════════════════════════════════════════
// ✅ CACHE GLOBAL DE PRODUTOS (OTIMIZAÇÃO FASE 1)
// ═══════════════════════════════════════════════════════════

let PRODUCTS_CACHE: Map<string, LeanProduct> | null = null
let PRODUCTS_CACHE_TIMESTAMP: number = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Pre-load produtos no cache (chamado no início do sync)
 */
async function preloadProductsCache(): Promise<void> {
  const now = Date.now()

  // Se cache válido, reutilizar
  if (PRODUCTS_CACHE && (now - PRODUCTS_CACHE_TIMESTAMP) < CACHE_TTL) {
    debugLog(`✅ [ProductCache] Cache válido (${Math.floor((now - PRODUCTS_CACHE_TIMESTAMP) / 1000)}s)`)
    return
  }

  debugLog(`📦 [ProductCache] Carregando produtos...`)
  const start = Date.now()

  const products = await Product.find({ isActive: true })
    .select('_id code platform curseducaGroupId platformData name')
    .lean() as unknown as LeanProduct[]

  PRODUCTS_CACHE = new Map()

  for (const p of products) {
    // Key: code
    PRODUCTS_CACHE.set(p.code, p)

    // Key: platform:code
    PRODUCTS_CACHE.set(`${p.platform}:${p.code}`, p)

    // Key (CursEduca): group_{groupId}
    if (p.platform === 'curseduca' && (p as any).curseducaGroupId) {
      PRODUCTS_CACHE.set(`group_${(p as any).curseducaGroupId}`, p)
    }
  }

  PRODUCTS_CACHE_TIMESTAMP = now

  debugLog(`✅ [ProductCache] ${products.length} produtos carregados em ${Date.now() - start}ms`)
}

/**
 * Limpar cache (útil para testes)
 */
export function clearProductsCache(): void {
  PRODUCTS_CACHE = null
  PRODUCTS_CACHE_TIMESTAMP = 0
}

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
  const useCache = PRODUCTS_CACHE !== null

  if (syncType === 'hotmart') {
    const productCode = item.productCode || 'OGI_V1'

    // Cache lookup
    if (useCache) {
      const cached = PRODUCTS_CACHE!.get(`hotmart:${productCode}`) || PRODUCTS_CACHE!.get(productCode)
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
        const cached = PRODUCTS_CACHE!.get(`group_${groupId}`)
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
          const cached = PRODUCTS_CACHE!.get(productCode)
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
      const allCurseduca = Array.from(PRODUCTS_CACHE!.values()).find(p => p.platform === 'curseduca')
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
      const cached = PRODUCTS_CACHE!.get('DISCORD_COMMUNITY') ||
                     Array.from(PRODUCTS_CACHE!.values()).find(p => p.platform === 'discord')
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
    await preloadProductsCache()

    // 🆕 Limpar lista de expirados (para sync Hotmart)
    if (config.syncType === 'hotmart') {
      clearExpiredList()
    }

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
          const result = await processSyncItem(item, config)

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

      expirationResult = await processExpiredStudentsInactivation()

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

  // Verificar se o user foi inativado manualmente
  const inactivation = (user as any).inactivation
  if (!inactivation?.isManuallyInactivated || !inactivation?.inactivatedAt) {
    return result
  }

  result.wasInactivated = true
  result.inactivatedAt = new Date(inactivation.inactivatedAt)

  // Só verificar renovações para Hotmart (onde temos purchaseDate)
  if (config.syncType !== 'hotmart' || !purchaseDate) {
    return result
  }

  result.purchaseDate = purchaseDate

  // Se a data de compra é MAIS RECENTE que a data de inativação → RENOVAÇÃO!
  if (purchaseDate > result.inactivatedAt) {
    result.shouldReactivate = true
    result.reactivationReason = 'renewal_detected'
    console.log(`🔄 [RenewalDetection] RENOVAÇÃO DETETADA!`)
    console.log(`   📧 User: ${user.email}`)
    console.log(`   📅 Inativado em: ${result.inactivatedAt.toISOString()}`)
    console.log(`   💳 Nova compra em: ${purchaseDate.toISOString()}`)
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
      'combined.status': 'ACTIVE',
      status: 'ACTIVE',
      'hotmart.status': 'ACTIVE',
      'curseduca.memberStatus': 'ACTIVE',
      'discord.isActive': true,
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

  // 3. Notificar Discord Bot para reativar (adicionar roles)
  if (process.env.DISCORD_BOT_URL) {
    try {
      const user = await User.findById(userId).lean() as any
      const discordId = user?.discord?.discordIds?.[0]

      if (discordId) {
        await fetch(`${process.env.DISCORD_BOT_URL}/add-roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: discordId,
            reason: `Renovação detetada automaticamente - Compra: ${renewalResult.purchaseDate?.toISOString()}`
          })
        })
        console.log(`   🎮 Discord: Roles restaurados para ${userEmail}`)
      }
    } catch (discordError: any) {
      console.warn(`   ⚠️ Discord: Erro ao restaurar roles para ${userEmail}:`, discordError.message)
    }
  }

  console.log(`✅ [AutoReactivation] ${userEmail} reativado com sucesso!`)
}

// ═══════════════════════════════════════════════════════════
// 🆕 NOVO: DETETAR E INATIVAR ALUNOS COM COMPRA > 380 DIAS
// ═══════════════════════════════════════════════════════════

const EXPIRATION_DAYS = 380 // Dias após compra para considerar expirado

interface ExpiredStudent {
  userId: string
  email: string
  name: string
  classId?: string
  className?: string
  purchaseDate: Date
  daysSincePurchase: number
}

// Lista global para coletar alunos expirados durante o sync
let expiredStudentsList: ExpiredStudent[] = []

/**
 * Verifica se um aluno expirou (compra há mais de 380 dias)
 * Retorna os dados do aluno expirado ou null se ainda válido
 */
function checkStudentExpiration(
  userId: string,
  email: string,
  name: string,
  purchaseDate: Date | null,
  classId?: string,
  className?: string
): ExpiredStudent | null {
  if (!purchaseDate) return null

  const now = new Date()
  const diffTime = now.getTime() - purchaseDate.getTime()
  const daysSincePurchase = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (daysSincePurchase > EXPIRATION_DAYS) {
    return {
      userId,
      email,
      name,
      classId,
      className,
      purchaseDate,
      daysSincePurchase
    }
  }

  return null
}

/**
 * Adiciona um aluno à lista de expirados (chamado durante processamento)
 */
function addToExpiredList(student: ExpiredStudent): void {
  // Evitar duplicados
  if (!expiredStudentsList.find(s => s.userId === student.userId)) {
    expiredStudentsList.push(student)
  }
}

/**
 * Limpa a lista de alunos expirados (chamado no início do sync)
 */
function clearExpiredList(): void {
  expiredStudentsList = []
}

/**
 * Retorna a lista atual de alunos expirados
 */
function getExpiredList(): ExpiredStudent[] {
  return [...expiredStudentsList]
}

/**
 * Processa a inativação em lote de todos os alunos expirados
 * Chamado no final do sync Hotmart
 */
async function processExpiredStudentsInactivation(): Promise<{
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

  const expiredList = getExpiredList()

  if (expiredList.length === 0) {
    console.log(`✅ [ExpirationCheck] Nenhum aluno expirado encontrado`)
    return result
  }

  console.log(`\n🔄 [ExpirationCheck] Processando ${expiredList.length} alunos expirados (compra > ${EXPIRATION_DAYS} dias)...`)

  // Agrupar por turma para depois atualizar
  const classesWithExpiredStudents = new Map<string, number>()

  for (const student of expiredList) {
    result.totalProcessed++

    try {
      // Verificar se já está inativo
      const user = await User.findById(student.userId).lean() as any

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
          status: 'INACTIVE',
          'hotmart.status': 'INACTIVE',
          // Guardar dados de inativação
          'inactivation.isManuallyInactivated': true,
          'inactivation.inactivatedAt': new Date(),
          'inactivation.inactivatedBy': 'Sistema - Expiração Automática',
          'inactivation.reason': `Compra expirada: ${student.daysSincePurchase} dias (limite: ${EXPIRATION_DAYS})`,
          'inactivation.platforms': ['hotmart'],
          'inactivation.classId': student.classId
        }
      })

      // Atualizar UserProduct
      await UserProduct.updateMany(
        { userId: student.userId },
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
            reason: `Compra expirada: ${student.daysSincePurchase} dias (limite: ${EXPIRATION_DAYS})`,
            daysSincePurchase: student.daysSincePurchase,
            purchaseDate: student.purchaseDate,
            classId: student.classId,
            className: student.className
          },
          platform: 'hotmart',
          action: 'update',
          changeDate: new Date(),
          source: 'SYSTEM',
          changedBy: 'Sistema - Expiração Automática',
          reason: `Expiração automática: compra há ${student.daysSincePurchase} dias`,
          metadata: {
            expirationType: 'automatic',
            daysSincePurchase: student.daysSincePurchase,
            expirationLimit: EXPIRATION_DAYS,
            purchaseDate: student.purchaseDate
          }
        })
      } catch (error: any) {
        console.warn(`   ⚠️ Erro ao registrar histórico de expiração para ${student.email}:`, error.message)
      }

      result.totalInactivated++

      // Rastrear turma afetada
      if (student.classId) {
        const count = classesWithExpiredStudents.get(student.classId) || 0
        classesWithExpiredStudents.set(student.classId, count + 1)
      }

      console.log(`   ✅ ${student.email} inativado (${student.daysSincePurchase} dias desde compra)`)

    } catch (error: any) {
      result.errors.push(`Erro ao inativar ${student.email}: ${error.message}`)
      console.error(`   ❌ Erro ao inativar ${student.email}:`, error.message)
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
    } catch (error: any) {
      result.errors.push(`Erro ao atualizar turma ${classId}: ${error.message}`)
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
async function ensureClassExists(
  classId: string,
  className: string | undefined,
  source: 'hotmart' | 'curseduca',
  curseducaId?: string,
  curseducaUuid?: string
): Promise<void> {
  if (!classId) return

  try {
    const existingClass = await Class.findOne({ classId })

    if (!existingClass) {
      // Criar nova turma
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

    } else {
      // Atualizar turma existente
      const updates: any = {
        lastSyncAt: new Date(),
        $inc: { studentCount: 0 } // Não incrementar aqui, será recalculado
      }

      // Atualizar nome se:
      // 1. Nome atual é genérico ("Turma X") e temos nome real
      // 2. Nome vem vazio e agora temos um nome real
      const isGenericName = existingClass.name.match(/^Turma [a-zA-Z0-9]+$/)
      const hasNewName = className && className !== existingClass.name && !className.match(/^Turma [a-zA-Z0-9]+$/)

      if (isGenericName && hasNewName) {
        updates.name = className
        console.log(`   📝 [Class] Nome atualizado: ${classId} - "${existingClass.name}" → "${className}"`)
      }

      // Atualizar campos CursEduca se necessário
      if (source === 'curseduca') {
        if (curseducaId && !existingClass.curseducaId) {
          updates.curseducaId = curseducaId
        }
        if (curseducaUuid && !existingClass.curseducaUuid) {
          updates.curseducaUuid = curseducaUuid
        }
      }

      await Class.findByIdAndUpdate(existingClass._id, updates)
    }
  } catch (error: any) {
    // Ignorar erros de duplicação (race condition)
    if (error.code !== 11000) {
      console.error(`   ⚠️ [Class] Erro ao criar/atualizar turma ${classId}:`, error.message)
    }
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: PROCESS SINGLE ITEM
// ═══════════════════════════════════════════════════════════

const processSyncItem = async (
  item: UniversalSourceItem,
  config: UniversalSyncConfig
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
      name,
      isActive: true
    })
    console.log(`✨ [UniversalSync] Novo user criado: ${user.email}`)
  }

  const userIdStr = String(user._id)

  // ═══════════════════════════════════════════════════════════
  // PREPARAR UPDATES DO USER
  // ═══════════════════════════════════════════════════════════
  const updateFields: Record<string, unknown> = {}
  let needsUpdate = false

  if (name && user.name !== name) {
    updateFields.name = name
    needsUpdate = true
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ HOTMART - VERSÃO COMPLETA (MANTÉM TUDO!)
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'hotmart') {
    // IDs
    if (item.hotmartUserId) {
      updateFields['hotmart.hotmartUserId'] = item.hotmartUserId
      needsUpdate = true
    }

    // ✅ DATAS (TODAS!)
    const purchaseDate = toDateOrNull(item.purchaseDate)
    const signupDate = toDateOrNull(item.signupDate)
    const firstAccessDate = toDateOrNull(item.firstAccessDate)
    const lastAccessDate = toDateOrNull(item.lastAccessDate)

    if (purchaseDate) {
      updateFields['hotmart.purchaseDate'] = purchaseDate
      needsUpdate = true
    }
    if (signupDate) {
      updateFields['hotmart.signupDate'] = signupDate
      needsUpdate = true
    }
    if (firstAccessDate) {
      updateFields['hotmart.firstAccessDate'] = firstAccessDate
      needsUpdate = true
    }
    if (lastAccessDate) {
      updateFields['hotmart.lastAccessDate'] = lastAccessDate
      needsUpdate = true
    }

    // Status
    if (item.plusAccess) {
      updateFields['hotmart.plusAccess'] = item.plusAccess
      needsUpdate = true
    }

    // Current Module
    if (item.currentModule !== undefined) {
      updateFields['hotmart.currentModule'] = toNumber(item.currentModule, 0)
      needsUpdate = true
    }
if (lastAccessDate) {
  updateFields['hotmart.lastAccessDate'] = lastAccessDate
  needsUpdate = true
}
    // Turmas
    if (item.classId) {
      // 🆕 DETECTAR MUDANÇA DE TURMA (CRÍTICO!)
      const oldClassId = (user as any).hotmart?.enrolledClasses?.[0]?.classId
      const oldClassName = (user as any).hotmart?.enrolledClasses?.[0]?.className
      const hasClassChanged = oldClassId && oldClassId !== item.classId

      updateFields['hotmart.enrolledClasses'] = [
        {
          classId: item.classId,
          className: item.className || `Turma ${item.classId}`,
          source: 'hotmart',
          isActive: true,
          enrolledAt: purchaseDate || new Date()
        }
      ]
      needsUpdate = true

      // ✅ NOVO: Garantir que turma existe na tabela Class
      await ensureClassExists(item.classId, item.className, 'hotmart')

      // 🆕 REGISTRAR MUDANÇA DE TURMA OU PRIMEIRA INSCRIÇÃO
      if (hasClassChanged) {
        // Mudança de turma
        try {
          const StudentClassHistory = (await import('../../models/StudentClassHistory')).default
          await StudentClassHistory.create({
            studentId: user._id,
            classId: item.classId,
            className: item.className || `Turma ${item.classId}`,
            previousClassId: oldClassId,
            previousClassName: oldClassName,
            dateMoved: new Date(),
            reason: 'Mudança detectada no sync Hotmart',
            movedBy: 'Sistema - Sync Automático'
          })
          console.log(`   📝 [ClassChange] ${user.email}: "${oldClassName}" → "${item.className || item.classId}"`)
        } catch (error: any) {
          console.warn(`   ⚠️ Erro ao registrar mudança de turma para ${user.email}:`, error.message)
        }
      } else if (!oldClassId && !isNew) {
        // Primeira atribuição de turma (user já existia mas não tinha turma)
        // Usar purchaseDate como data de inscrição
        try {
          const StudentClassHistory = (await import('../../models/StudentClassHistory')).default
          await StudentClassHistory.create({
            studentId: user._id,
            classId: item.classId,
            className: item.className || `Turma ${item.classId}`,
            dateMoved: purchaseDate || new Date(),
            reason: 'Primeira inscrição na turma (data de compra)',
            movedBy: 'Sistema - Sync Automático'
          })
          console.log(`   ✨ [FirstEnrollment] ${user.email} inscrito em "${item.className || item.classId}" (${purchaseDate ? purchaseDate.toISOString().split('T')[0] : 'hoje'})`)
        } catch (error: any) {
          console.warn(`   ⚠️ Erro ao registrar primeira inscrição para ${user.email}:`, error.message)
        }
      }
    }

    // Metadata
    updateFields['hotmart.lastSyncAt'] = new Date()
    updateFields['hotmart.syncVersion'] = '3.0'
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.hotmart.lastSync'] = new Date()
    updateFields['metadata.sources.hotmart.version'] = '3.0'
    needsUpdate = true
  }

// ═══════════════════════════════════════════════════════════
// ✅ CURSEDUCA - VERSÃO COMPLETA COM TODOS OS CAMPOS NOVOS
// ═══════════════════════════════════════════════════════════
  if (config.syncType === 'curseduca') {
    // ═══════════════════════════════════════════════════════════
    // IDs
    // ═══════════════════════════════════════════════════════════
    if (item.curseducaUserId && item.curseducaUserId !== (user as any).curseduca?.curseducaUserId) {
      updateFields['curseduca.curseducaUserId'] = item.curseducaUserId
      needsUpdate = true
    }

    if (item.curseducaUuid) {
      updateFields['curseduca.curseducaUuid'] = item.curseducaUuid
      needsUpdate = true
    }

    // ═══════════════════════════════════════════════════════════
    // 🆕 NOVO: enrollmentsCount (quantos produtos o user tem)
    // ═══════════════════════════════════════════════════════════
    if (item.platformData?.enrollmentsCount !== undefined) {
      updateFields['curseduca.enrollmentsCount'] = item.platformData.enrollmentsCount
      needsUpdate = true
    }

    // ═══════════════════════════════════════════════════════════
    // GRUPOS
    // ═══════════════════════════════════════════════════════════
    if (item.groupId) {
      updateFields['curseduca.groupId'] = String(item.groupId)
      needsUpdate = true

      // ✅ CORRIGIDO: Usar SEMPRE groupId como classId, não curseducaUuid (que é do aluno!)
      // groupId identifica o grupo/turma, curseducaUuid identifica o aluno
      const classIdForCurseduca = String(item.groupId)
      await ensureClassExists(
        classIdForCurseduca,
        item.groupName,
        'curseduca',
        String(item.groupId),
        undefined // Não passar curseducaUuid aqui (é do aluno, não do grupo)
      )
    }

    if (item.groupName) {
      updateFields['curseduca.groupName'] = item.groupName
      needsUpdate = true
    }

    // ═══════════════════════════════════════════════════════════
    // 🔥 CRITICAL FIX: POPULATE enrolledClasses ARRAY
    // ═══════════════════════════════════════════════════════════
    // This is the ROOT CAUSE of the bug - we were saving groupId but NOT enrolledClasses!
    // Now we populate the enrolledClasses array from allCurseducaGroups

    // ✅ FIX: Processar TODOS os grupos do array allCurseducaGroups
    const allCurseducaGroups = (item as any).allCurseducaGroups

    if (allCurseducaGroups && Array.isArray(allCurseducaGroups) && allCurseducaGroups.length > 0) {
      // Processar TODOS os grupos de uma vez
      const newEnrolledClasses: any[] = []

      for (const group of allCurseducaGroups) {
        const enrolledAtDate = toDateOrNull(group.enrolledAt) || new Date()
        const expiresAtDate = toDateOrNull(group.expiresAt) || null

        const enrolledClass = {
          classId: String(group.groupId),
          className: group.groupName || `Grupo ${group.groupId}`,
          curseducaId: String(group.groupId),
          curseducaUuid: String(group.groupId), // Use groupId como UUID
          enteredAt: enrolledAtDate,
          expiresAt: expiresAtDate,
          isActive: true,
          role: group.role || 'student'
        }

        newEnrolledClasses.push(enrolledClass)
      }

      // Substituir TODO o array enrolledClasses de uma vez
      // Isto garante que não há duplicações e que todos os grupos são salvos
      updateFields['curseduca.enrolledClasses'] = newEnrolledClasses
      needsUpdate = true

      console.log(`   📚 [EnrolledClasses] Guardados ${newEnrolledClasses.length} grupos para ${user.email}:`)
      newEnrolledClasses.forEach(ec => {
        console.log(`      - ${ec.className} (ID: ${ec.curseducaId})`)
      })

    } else if (item.groupId) {
      // ⚠️ FALLBACK: Se não há allCurseducaGroups, usar groupId (modo antigo)
      // Isto só acontece se o adapter não foi atualizado ainda
      const enrolledAtDate = toDateOrNull(item.enrolledAt) || new Date()
      const expiresAtDate = toDateOrNull(item.expiresAt) || null

      const singleClass = {
        classId: String(item.groupId),
        className: item.groupName || `Grupo ${item.groupId}`,
        curseducaId: String(item.groupId),
        curseducaUuid: String(item.groupId),
        enteredAt: enrolledAtDate,
        expiresAt: expiresAtDate,
        isActive: true,
        role: 'student'
      }

      updateFields['curseduca.enrolledClasses'] = [singleClass]
      needsUpdate = true

      console.log(`   ⚠️  [EnrolledClasses] FALLBACK: Guardado 1 grupo para ${user.email}`)
    }

    // ═══════════════════════════════════════════════════════════
    // SUBSCRIPTION TYPE
    // ═══════════════════════════════════════════════════════════
    if (item.subscriptionType) {
      updateFields['curseduca.subscriptionType'] = item.subscriptionType
      needsUpdate = true
    }

    // ═══════════════════════════════════════════════════════════
    // 🆕 NOVO: Situation (ACTIVE/INACTIVE/SUSPENDED)
    // ═══════════════════════════════════════════════════════════
    if (item.platformData?.situation) {
      updateFields['curseduca.situation'] = item.platformData.situation
      needsUpdate = true
    }

    // ═══════════════════════════════════════════════════════════
    // MEMBER STATUS (retrocompatibilidade)
    // ═══════════════════════════════════════════════════════════
    updateFields['curseduca.memberStatus'] = 'ACTIVE'
    needsUpdate = true

    // ═══════════════════════════════════════════════════════════
    // DATAS
    // ═══════════════════════════════════════════════════════════
    
    // lastAccess (retrocompatibilidade)
    const lastAccess = toDateOrNull(item.lastAccess)
    if (lastAccess) {
      updateFields['curseduca.lastAccess'] = lastAccess
      needsUpdate = true
    }

    // 🆕 NOVO: lastLogin (do endpoint /members/{id})
    const lastLogin = toDateOrNull(item.lastLogin)
    if (lastLogin) {
      updateFields['curseduca.lastLogin'] = lastLogin
      needsUpdate = true
    }

    // 🆕 NOVO: enrolledAt → joinedDate
    const enrolledAt = toDateOrNull(item.enrolledAt)
    if (enrolledAt) {
      updateFields['curseduca.joinedDate'] = enrolledAt
      needsUpdate = true
    }

    // ═══════════════════════════════════════════════════════════
    // PROGRESSO
    // ═══════════════════════════════════════════════════════════
    if (item.progress?.percentage !== undefined) {
      updateFields['curseduca.progress.estimatedProgress'] = toNumber(item.progress.percentage, 0)
      needsUpdate = true
    }

    // ═══════════════════════════════════════════════════════════
    // METADATA DE SYNC
    // ═══════════════════════════════════════════════════════════
    updateFields['curseduca.lastSyncAt'] = new Date()
    updateFields['curseduca.syncVersion'] = '3.1'  // ✅ Versão atualizada
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.curseduca.lastSync'] = new Date()
    updateFields['metadata.sources.curseduca.version'] = '3.1'
    needsUpdate = true
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
  // 🆕 VERIFICAR EXPIRAÇÃO (compra > 380 dias) - só para Hotmart
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'hotmart' && purchaseDate && !renewalResult.shouldReactivate) {
    const expiredStudent = checkStudentExpiration(
      userIdStr,
      user.email,
      user.name,
      purchaseDate,
      item.classId,
      item.className
    )

    if (expiredStudent) {
      // Adicionar à lista para processar no final do sync
      addToExpiredList(expiredStudent)
      debugLog(`   ⏰ [Expiration] ${user.email} marcado para inativação (${expiredStudent.daysSincePurchase} dias)`)
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
      const upUpdateFields: Record<string, any> = {}
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

        // lessonsCompleted - array de pageIds das aulas completadas
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          const completedLessons = item.progress.lessons
            .filter((l: any) => l.isCompleted)
            .map((l: any) => l.pageId)

          if (completedLessons.length > 0) {
            upUpdateFields['progress.lessonsCompleted'] = completedLessons
            upNeedsUpdate = true
          }
        }

        // modulesCompleted - extrair módulos únicos das aulas completadas
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          const completedModules = [...new Set(
            item.progress.lessons
              .filter((l: any) => l.isCompleted && l.moduleName)
              .map((l: any) => l.moduleName)
          )]

          if (completedModules.length > 0) {
            upUpdateFields['progress.modulesCompleted'] = completedModules
            upNeedsUpdate = true
          }
        }
      }
      
      // ═══════════════════════════════════════════════════════════
      // ENGAGEMENT - Score e campos básicos
      // ═══════════════════════════════════════════════════════════
      if (item.engagement?.engagementScore !== undefined) {
        const newScore = toNumber(item.engagement.engagementScore, 0)
        if (existingUP.engagement?.engagementScore !== newScore) {
          upUpdateFields['engagement.engagementScore'] = newScore
          upUpdateFields['engagement.lastAction'] = toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
          upNeedsUpdate = true
        }
      } else if (item.accessCount !== undefined) {
        const newScore = toNumber(item.accessCount, 0)
        if (existingUP.engagement?.engagementScore !== newScore) {
          upUpdateFields['engagement.engagementScore'] = newScore
          upUpdateFields['engagement.lastAction'] = toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
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
          upUpdateFields['engagement.lastAction'] = toDateOrNull(item.lastLogin)
          upNeedsUpdate = true
        }
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

        // Verificar se a turma já existe no array
        const existingClassIndex = existingUP.classes?.findIndex((c: any) => c.classId === classId) ?? -1

        if (existingClassIndex === -1) {
          // Adicionar nova turma ao array (SEM className - virá da tabela Class)
          upUpdateFields['classes'] = [
            ...(existingUP.classes || []),
            {
              classId,
              joinedAt: enrollmentDate,
              leftAt: null
            }
          ]
          upNeedsUpdate = true
          console.log(`   📚 [Classes] Adicionada turma ${classId} para ${user.email}`)
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
          
          if (metrics.engagement.actionsLastWeek !== undefined) {
            upUpdateFields['engagement.actionsLastWeek'] = metrics.engagement.actionsLastWeek
            upNeedsUpdate = true
          }
          
          if (metrics.engagement.actionsLastMonth !== undefined) {
            upUpdateFields['engagement.actionsLastMonth'] = metrics.engagement.actionsLastMonth
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
      } catch (metricsError: any) {
        console.error(`   ❌ [Sprint 1.5B] Erro ao calcular engagement metrics:`, metricsError.message)
      }
      
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
            console.log(`      ✅ Novo produto mais recente → PRIMARY`)
            await UserProduct.updateOne(
              { _id: existingPrimary._id },
              { $set: { isPrimary: false } }
            )
          } else {
            console.log(`      🔻 Novo produto → SECONDARY`)
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

      // Não guardamos className no UserProduct - ele vem da tabela Class via lookup
      const classesArray = classId ? [{
        classId,
        joinedAt: enrolledAt,
        leftAt: null
      }] : []

      // ═══════════════════════════════════════════════════════════
      // Construir objeto progress por plataforma
      // ═══════════════════════════════════════════════════════════
      const progressObj: any = {
        percentage: item.progress?.percentage ? toNumber(item.progress.percentage, 0) : 0,
        lastActivity: toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
      }

      // 🔥 HOTMART - Adicionar campos específicos
      if (config.syncType === 'hotmart') {
        if (item.currentModule !== undefined) {
          progressObj.currentModule = toNumber(item.currentModule, 0)
        }

        // lessonsCompleted - array de pageIds
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          progressObj.lessonsCompleted = item.progress.lessons
            .filter((l: any) => l.isCompleted)
            .map((l: any) => l.pageId)
        }

        // modulesCompleted - array de módulos únicos
        if (item.progress?.lessons && Array.isArray(item.progress.lessons)) {
          progressObj.modulesCompleted = [...new Set(
            item.progress.lessons
              .filter((l: any) => l.isCompleted && l.moduleName)
              .map((l: any) => l.moduleName)
          )]
        }
      }

      // ═══════════════════════════════════════════════════════════
      // Construir objeto engagement por plataforma
      // ═══════════════════════════════════════════════════════════
      const engagementObj: any = {
        engagementScore: item.engagement?.engagementScore
          ? toNumber(item.engagement.engagementScore, 0)
          : toNumber(item.accessCount, 0),
        lastAction: toDateOrNull(item.lastAccessDate || item.lastLogin) || new Date()
      }

      // 🔥 HOTMART - Engagement baseado em logins
      if (config.syncType === 'hotmart') {
        if (item.accessCount !== undefined) {
          engagementObj.totalLogins = toNumber(item.accessCount, 0)
        }
        if (item.lastAccessDate) {
          engagementObj.lastLogin = toDateOrNull(item.lastAccessDate)
        }
      }

      // 🎓 CURSEDUCA - Engagement baseado em ações
      if (config.syncType === 'curseduca') {
        if (item.lastLogin) {
          engagementObj.lastAction = toDateOrNull(item.lastLogin)
        }
      }

      // ═══════════════════════════════════════════════════════════
      // Criar novo UserProduct com TODOS os campos
      // ═══════════════════════════════════════════════════════════
      const newUserProduct: any = {
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
            daysSinceLastLogin: metrics.engagement.daysSinceLastLogin,
            daysSinceLastAction: metrics.engagement.daysSinceLastAction,
            totalLogins: metrics.engagement.totalLogins || 0,
            actionsLastWeek: metrics.engagement.actionsLastWeek || 0,
            actionsLastMonth: metrics.engagement.actionsLastMonth || 0
          }
          
          // Adicionar metadata
          if (!newUserProduct.metadata) {
            newUserProduct.metadata = {}
          }
          
          newUserProduct.metadata = {
            ...newUserProduct.metadata,
            purchaseDate: metrics.metadata.purchaseDate,
            platform: metrics.metadata.platform,
            purchaseValue: metrics.metadata.purchaseValue
          }
          
          console.log(`   ✅ [Sprint 1.5B] Engagement metrics adicionados ao novo UserProduct`)
        }
      } catch (metricsError: any) {
        console.error(`   ❌ [Sprint 1.5B] Erro ao calcular engagement metrics:`, metricsError.message)
      }
      
      // Dados específicos da plataforma
      if (config.syncType === 'hotmart') {
        newUserProduct.hotmartData = {
          hotmartUserId: item.hotmartUserId,
          productCode: item.productCode
        }
      }
      
      if (config.syncType === 'curseduca') {
        newUserProduct.curseducaData = {
          curseducaUserId: item.curseducaUserId,
          groupId: item.groupId,
          subscriptionType: item.subscriptionType
        }
      }
      
      if (config.syncType === 'discord') {
        newUserProduct.discordData = {
          discordUserId: item.discordUserId,
          username: item.username
        }
      }
      
      await UserProduct.create(newUserProduct)
      debugLog(`   ✨ UserProduct CRIADO: ${user.email} → ${config.syncType}`)
    }
    
  } catch (upError: any) {
    console.error(`❌ [UniversalSync] Erro ao criar/atualizar UserProduct para ${user.email}:`, upError.message)
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
export function calculateEngagementMetricsForUserProduct(
  user: IUser,
  product: IProduct
): {
  engagement: {
    daysSinceLastLogin: number | null
    daysSinceLastAction: number | null
    daysSinceEnrollment: number | null    // 🆕 ADICIONAR ESTA LINHA
    enrolledAt: Date | null               // 🆕 ADICIONAR ESTA LINHA
    totalLogins?: number
    actionsLastWeek?: number
    actionsLastMonth?: number
  }
  metadata: {
    purchaseValue: number | null
    purchaseDate: Date | null
    platform: string
  }
} {
  debugLog(`📊 [EngagementMetrics] Calculando para produto: ${product.code}`)

  const platform = product.platform
  const now = Date.now()

  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT POR PLATAFORMA
  // ═══════════════════════════════════════════════════════════

  let daysSinceLastLogin: number | null = null
  let daysSinceLastAction: number | null = null
  let daysSinceEnrollment: number | null = null  // 🆕 ADICIONAR ESTA LINHA
  let enrolledAt: Date | null = null             // 🆕 ADICIONAR ESTA LINHA
  let totalLogins = 0
  let actionsLastWeek = 0
  let actionsLastMonth = 0

  if (platform === 'hotmart') {
    // ✅ HOTMART = LOGIN-BASED
    // ✅ FIX: Múltiplos fallbacks para lastAccessDate
    const lastLogin =
      user.hotmart?.lastAccessDate ||
      user.hotmart?.progress?.lastAccessDate ||
      user.hotmart?.firstAccessDate

    if (lastLogin) {
      const lastLoginTime = lastLogin instanceof Date ? lastLogin.getTime() : new Date(lastLogin).getTime()
      daysSinceLastLogin = Math.floor((now - lastLoginTime) / (1000 * 60 * 60 * 24))
      debugLog(`   ✅ daysSinceLastLogin: ${daysSinceLastLogin} dias`)
    }
    // Silenciar aviso (normal para alunos novos sem histórico)

    // ✅ CORRIGIDO: user.hotmart.engagement.accessCount
    totalLogins = user.hotmart?.engagement?.accessCount || 0

  } else if (platform === 'curseduca') {
    // ✅ CURSEDUCA = ACTION-BASED
    // ✅ CORRIGIDO: CursEduca não tem lastActionDate explícito
    // Usar progress.lastActivity ou joinedDate como fallback
    const lastAction = user.curseduca?.lastAccess || user.curseduca?.joinedDate

    if (lastAction) {
      const lastActionTime = lastAction instanceof Date ? lastAction.getTime() : new Date(lastAction).getTime()
      daysSinceLastAction = Math.floor((now - lastActionTime) / (1000 * 60 * 60 * 24))
      debugLog(`   ✅ daysSinceLastAction: ${daysSinceLastAction} dias`)
    } else {
      debugLog(`   ⚠️  CursEduca progress.lastActivity não disponível`)
    }

    // Ações (não disponível no modelo atual)
    actionsLastWeek = 0 // TODO: Implementar quando API fornecer
    actionsLastMonth = 0 // TODO: Implementar quando API fornecer

    // 🆕 NOVO: Calcular daysSinceEnrollment
    // Prioridade: enrolledClasses[0].enteredAt > joinedDate > createdAt
    const enrollmentDate = user.curseduca?.enrolledClasses?.[0]?.enteredAt || 
                          user.curseduca?.joinedDate || 
                          user.metadata?.createdAt

    if (enrollmentDate) {
      enrolledAt = enrollmentDate instanceof Date ? enrollmentDate : new Date(enrollmentDate)
      const enrollmentTime = enrolledAt.getTime()
      daysSinceEnrollment = Math.floor((now - enrollmentTime) / (1000 * 60 * 60 * 24))
      debugLog(`   ✅ daysSinceEnrollment: ${daysSinceEnrollment} dias (enrolled: ${enrolledAt.toISOString()})`)
    }

  } else if (platform === 'discord') {
    // DISCORD = Não implementado ainda
    debugLog(`   ℹ️  Discord: métricas de engagement não implementadas`)
  }

  // ═══════════════════════════════════════════════════════════
  // PURCHASE VALUE & DATE
  // ═══════════════════════════════════════════════════════════

  let purchaseValue: number | null = null
  let purchaseDate: Date | null = null

  if (platform === 'hotmart') {
    // ✅ CORRIGIDO: purchaseValue NÃO está no modelo User
    // Será populado diretamente no UserProduct pelo webhook
    purchaseValue = null // ⚠️ TODO: Adicionar user.hotmart.purchaseValue se necessário

    // ✅ CORRIGIDO: purchaseDate existe no modelo
    purchaseDate = user.hotmart?.purchaseDate || 
                  user.hotmart?.firstAccessDate || 
                  user.metadata?.createdAt || 
                  null



  } else if (platform === 'curseduca') {
    // ✅ CORRIGIDO: subscriptionValue NÃO está no modelo User
    // Será populado diretamente no UserProduct pelo webhook
    purchaseValue = null // ⚠️ TODO: Adicionar user.curseduca.subscriptionValue se necessário

    // ✅ CORRIGIDO: joinedDate existe no modelo
    purchaseDate = user.curseduca?.joinedDate || 
                  user.metadata?.createdAt || 
                  null

    if (purchaseDate) {
      debugLog(`   📅 CursEduca joinedDate: ${purchaseDate.toISOString()}`)
    }

  } else if (platform === 'discord') {
    // Discord geralmente não tem purchase (é community)
    purchaseValue = null
    // ✅ CORRIGIDO: user.discord.createdAt
    purchaseDate = user.discord?.createdAt || user.metadata?.createdAt || null
  }

  // ═══════════════════════════════════════════════════════════
  // RETORNAR MÉTRICAS
  // ═══════════════════════════════════════════════════════════

  const metrics = {
    engagement: {
      daysSinceLastLogin,
      daysSinceLastAction,
      daysSinceEnrollment,
      enrolledAt,
      totalLogins,
      actionsLastWeek,
      actionsLastMonth
    },
    metadata: {
      purchaseValue,
      purchaseDate,
      platform
    }
  }

  debugLog(`   ✅ Métricas calculadas para ${product.code}`)

  return metrics
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  executeUniversalSync
}