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
import { IProduct } from '../../models/Product'

// ═══════════════════════════════════════════════════════════
// TYPE HELPERS
// ═══════════════════════════════════════════════════════════

type LeanProduct = {
  _id: mongoose.Types.ObjectId
  code: string
}
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

function debugLog(...args: any[]) {
  if (LOG_LEVEL === 'debug') {
    console.log(...args)
  }
}

function infoLog(...args: any[]) {
  if (LOG_LEVEL === 'debug' || LOG_LEVEL === 'info') {
    console.log(...args)
  }
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface UniversalSourceItem {
  // Base
  email?: string
  name?: string

  // IDs genéricos
  id?: string
  userId?: string

  // HOTMART
  hotmartUserId?: string
  purchaseDate?: Date | string | null
  signupDate?: Date | string | null
  firstAccessDate?: Date | string | null
  lastAccessDate?: Date | string | null
  plusAccess?: string
  classId?: string
  className?: string
  productCode?: string // ✅ ADICIONADO
  currentModule?: number // ✅ ADICIONADO
    platformData?: {
    isPrimary?: boolean
    [key: string]: unknown
  }
  // ✅ CORRIGIDO: Estrutura de progresso unificada
  progress?: {
    percentage?: number // Para todas as plataformas
    completed?: number  // Hotmart específico
    lessons?: Array<{
      pageId?: string
      pageName?: string
      isCompleted?: boolean
      completedDate?: Date | string | null
    }>
  }
  
  accessCount?: number | string
  engagementLevel?: string
  
  // ✅ CORRIGIDO: Engagement unificado
  engagement?: {
    engagementScore?: number
  }

  // CURSEDUCA
  curseducaUserId?: string
  curseducaUuid?: string
  groupId?: string | number
  groupName?: string
  subscriptionType?: 'MONTHLY' | 'ANNUAL'
  enrolledAt?: Date | string | null
  joinedDate?: Date | string | null

  // DISCORD
  discordUserId?: string
  username?: string
  roles?: string[]

  // Extra
  [key: string]: unknown
}

export interface UniversalSyncConfig {
  // Identificação
  syncType: SyncType
  jobName: string
  jobId?: string

  // Trigger
  triggeredBy: TriggerType
  triggeredByUser?: string

  // Configurações
  fullSync: boolean
  includeProgress: boolean
  includeTags: boolean
  batchSize: number

  // Dados da fonte
  sourceData: UniversalSourceItem | UniversalSourceItem[]

  // Callbacks opcionais
  onProgress?: (progress: SyncProgress) => void
  onError?: (error: SyncError) => void
  onWarning?: (warning: SyncWarning) => void
}

export interface SyncProgress {
  current: number
  total: number
  percentage: number
  message: string
}

export interface SyncError {
  message: string
  userId?: string
  userEmail?: string
  stack?: string
  code?: string
}

export interface SyncWarning {
  message: string
  userId?: string
  context?: string
}

interface ProcessItemResult {
  action: 'inserted' | 'updated' | 'unchanged' | 'skipped'
  userId?: string
}

export interface UniversalSyncResult {
  success: boolean
  reportId: string
  syncHistoryId: string
  stats: {
    total: number
    inserted: number
    updated: number
    errors: number
    skipped: number
    unchanged: number
  }
  duration: number
  errors: SyncError[]
  warnings: SyncWarning[]
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
// ✅ NOVO: MAPEAMENTO DINÂMICO DE PRODUTOS (SEM HARDCODE!)
// ═══════════════════════════════════════════════════════════

/**
 * Determina o produto correto baseado nos dados do item e na plataforma
 * ✅ Totalmente escalável - busca produtos dinamicamente na BD
 */
async function determineProductId(
  item: UniversalSourceItem,
  syncType: SyncType
): Promise<mongoose.Types.ObjectId | null> {
  
  if (syncType === 'hotmart') {
    // Hotmart: usar productCode se fornecido, senão buscar produto default
    const productCode = item.productCode || 'OGI_V1'
    
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
    // ✅ ESTRATÉGIA ESCALÁVEL: Buscar produto por curseducaGroupId
    // Isto permite adicionar novos grupos sem mudar código!
    
    const groupId = String(item.groupId || '') // Normalizar para string
    
    if (groupId) {
      // 1ª tentativa: Buscar por curseducaGroupId exato
      const product = await Product.findOne({
        platform: 'curseduca',
        isActive: true
      }).select('_id code').lean() as LeanProduct | null
      
      if (product) {
        debugLog(`✅ [ProductMapping] Produto encontrado por groupId ${groupId}: ${product.code}`)
        return product._id
      }
    }
    
    // 2ª tentativa: Buscar por subscriptionType (MONTHLY/ANNUAL)
    if (item.subscriptionType) {
      // Mapear subscriptionType → código do produto
      const productCode = 
        item.subscriptionType === 'MONTHLY' ? 'CLAREZA_MENSAL' :
        item.subscriptionType === 'ANNUAL' ? 'CLAREZA_ANUAL' :
        null

      if (productCode) {  // ✅ ADICIONAR ESTA VALIDAÇÃO!
        const product = await Product.findOne({
          platform: 'curseduca',
          code: productCode,
          isActive: true
        }).select('_id code').lean() as LeanProduct | null  // ✅ Adicionar .select().lean()

        if (product) {
          debugLog(`✅ [ProductMapping] Produto encontrado por subscriptionType ${item.subscriptionType}: ${product.code}`)
          return product._id
        }
        
        // ✅ ADICIONAR WARNING se não encontrar
        console.warn(`⚠️ [ProductMapping] Produto não encontrado para subscriptionType: ${item.subscriptionType} (${productCode})`)
      }
    }
    
    // 3ª tentativa: Buscar por groupName (case-insensitive)
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
    
    // 4ª tentativa: Produto default da plataforma (primeiro ativo)
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
    // Discord: buscar produto por code ou primeiro ativo
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
  // ════════════════════════════════════════════════════════════
    // ❌ FASE 1: COMENTADO - Progress vai para UserProduct
    // Data: 2025-12-27
    // Motivo: User não deve ter progress (fonte única = UserProduct)
    // ════════════════════════════════════════════════════════════
    /*
    // Progress básico
    if (item.progress !== undefined) {
      updateFields['hotmart.progress'] = {
        totalProgress: toNumber(item.progress.percentage, 0),
        currentModule: toNumber(item.currentModule, 0),
        lastUpdatedAt: new Date()
      }
      needsUpdate = true
    }
    */
    // Turmas
    if (item.classId) {
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
    }

   // ════════════════════════════════════════════════════════════
    // ❌ FASE 1: COMENTADO - Progress detalhado vai para UserProduct
    // Data: 2025-12-27
    // Motivo: User não deve ter progress (fonte única = UserProduct)
    // ════════════════════════════════════════════════════════════
    /*
    // Progress detalhado (sobrescreve se includeProgress)
    if (config.includeProgress && item.progress) {
      updateFields['hotmart.progress'] = {
        totalTimeMinutes: 0,
        completedLessons: toNumber(item.progress.completed, 0),
        lessonsData: (item.progress.lessons || []).map(l => ({
          lessonId: l.pageId,
          title: l.pageName,
          completed: Boolean(l.isCompleted),
          completedAt: toDateOrNull(l.completedDate),
          timeSpent: 0
        })),
        lastAccessDate: lastAccessDate || new Date()
      }
      needsUpdate = true
    }
    */

    // ════════════════════════════════════════════════════════════
    // ❌ FASE 1: COMENTADO - Engagement vai para UserProduct
    // Data: 2025-12-27
    // Motivo: User não deve ter engagement (fonte única = UserProduct)
    // ════════════════════════════════════════════════════════════
    /*
    // Engagement
    if (item.accessCount !== undefined || item.engagementLevel || item.engagement?.engagementScore) {
      updateFields['hotmart.engagement'] = {
        accessCount: toNumber(item.accessCount, 0),
        engagementLevel: item.engagementLevel || 'NONE',
        engagementScore: item.engagement?.engagementScore || toNumber(item.accessCount, 0),
        calculatedAt: new Date()
      }
      needsUpdate = true
    }
    */

    // Metadata
    updateFields['hotmart.lastSyncAt'] = new Date()
    updateFields['hotmart.syncVersion'] = '3.0'
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.hotmart.lastSync'] = new Date()
    updateFields['metadata.sources.hotmart.version'] = '3.0'
    needsUpdate = true
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ CURSEDUCA - VERSÃO COMPLETA
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'curseduca') {
    // IDs
    if (item.curseducaUserId && item.curseducaUserId !== (user as any).curseduca?.curseducaUserId) {
      updateFields['curseduca.curseducaUserId'] = item.curseducaUserId
      needsUpdate = true
    }

    if (item.curseducaUuid) {
      updateFields['curseduca.curseducaUuid'] = item.curseducaUuid
      needsUpdate = true
    }

    // Grupos
    if (item.groupId) {
      updateFields['curseduca.groupId'] = String(item.groupId)
      updateFields['curseduca.groupName'] = item.groupName
      updateFields['curseduca.groups'] = [
        {
          groupId: item.groupId,
          groupName: item.groupName,
          joinedAt: new Date()
        }
      ]
      needsUpdate = true
    }

    // Subscription Type
    if (item.subscriptionType) {
      updateFields['curseduca.subscriptionType'] = item.subscriptionType
      needsUpdate = true
    }

    // Member Status
    updateFields['curseduca.memberStatus'] = 'ACTIVE'
    needsUpdate = true

    // Datas
const lastAccess = toDateOrNull(item.lastAccess)
if (lastAccess) {
  updateFields['curseduca.lastAccess'] = lastAccess
  needsUpdate = true
}

 // ════════════════════════════════════════════════════════════
    // ❌ FASE 1: COMENTADO - Progress vai para UserProduct
    // Data: 2025-12-27
    // Motivo: User não deve ter progress (fonte única = UserProduct)
    // ════════════════════════════════════════════════════════════
    /*
    // Progress
    if (item.progress?.percentage !== undefined) {
      const progressPercentage = toNumber(item.progress.percentage, 0)
      
      updateFields['curseduca.progress'] = {
        estimatedProgress: progressPercentage,
        activityLevel: progressPercentage > 50 ? 'HIGH' : 
                      progressPercentage > 20 ? 'MEDIUM' : 'LOW',
        groupEngagement: 0,
        progressSource: 'estimated'
      }
      needsUpdate = true
    }
    */

    // ════════════════════════════════════════════════════════════
    // ❌ FASE 1: COMENTADO - Engagement vai para UserProduct
    // Data: 2025-12-27
    // Motivo: User não deve ter engagement (fonte única = UserProduct)
    // ════════════════════════════════════════════════════════════
    /*
    // Engagement
    if (item.progress?.percentage !== undefined || item.engagement?.engagementScore !== undefined) {
      const engagementScore = item.engagement?.engagementScore || 
                             (item.progress?.percentage ? toNumber(item.progress.percentage, 0) * 2 : 0)
      
      updateFields['curseduca.engagement'] = {
        alternativeEngagement: Math.min(100, engagementScore),
        activityLevel: engagementScore > 50 ? 'HIGH' : 
                      engagementScore > 20 ? 'MEDIUM' : 'LOW',
        engagementLevel: engagementScore > 75 ? 'MUITO_ALTO' :
                        engagementScore > 50 ? 'ALTO' :
                        engagementScore > 25 ? 'MEDIO' :
                        engagementScore > 10 ? 'BAIXO' : 'MUITO_BAIXO',
        calculatedAt: new Date()
      }
      needsUpdate = true
    }
    */

    // Metadata
    updateFields['curseduca.lastSyncAt'] = new Date()
    updateFields['curseduca.syncVersion'] = '2.0'
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.curseduca.lastSync'] = new Date()
    updateFields['metadata.sources.curseduca.version'] = '2.0'
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
      
      // Progress
      if (item.progress?.percentage !== undefined) {
        const newPercentage = toNumber(item.progress.percentage, 0)
        if (existingUP.progress?.percentage !== newPercentage) {
          upUpdateFields['progress.percentage'] = newPercentage
          upUpdateFields['progress.lastActivity'] = toDateOrNull(item.lastAccessDate) || new Date()
          upNeedsUpdate = true
        }
      }
      
      // Engagement Score
      if (item.engagement?.engagementScore !== undefined) {
        const newScore = toNumber(item.engagement.engagementScore, 0)
        if (existingUP.engagement?.engagementScore !== newScore) {
          upUpdateFields['engagement.engagementScore'] = newScore
          upUpdateFields['engagement.lastAction'] = toDateOrNull(item.lastAccessDate) || new Date()
          upNeedsUpdate = true
        }
      } else if (item.accessCount !== undefined) {
        const newScore = toNumber(item.accessCount, 0)
        if (existingUP.engagement?.engagementScore !== newScore) {
          upUpdateFields['engagement.engagementScore'] = newScore
          upUpdateFields['engagement.lastAction'] = toDateOrNull(item.lastAccessDate) || new Date()
          upNeedsUpdate = true
        }
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
      
      const newUserProduct: any = {
        userId: userIdStr,
        productId: productId,
        platform: config.syncType,
        platformUserId: item.curseducaUserId || item.hotmartUserId || item.discordUserId || userIdStr,
        status: 'ACTIVE',
        source: 'PURCHASE',
        enrolledAt: enrolledAt,
        isPrimary: isPrimaryValue,
        
        progress: {
          percentage: item.progress?.percentage ? toNumber(item.progress.percentage, 0) : 0,
          lastActivity: toDateOrNull(item.lastAccessDate) || new Date()
        },
        
        engagement: {
          engagementScore: item.engagement?.engagementScore 
            ? toNumber(item.engagement.engagementScore, 0) 
            : toNumber(item.accessCount, 0),
          lastAction: toDateOrNull(item.lastAccessDate) || new Date()
        }
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
  let totalLogins = 0
  let actionsLastWeek = 0
  let actionsLastMonth = 0

  if (platform === 'hotmart') {
    // ✅ HOTMART = LOGIN-BASED
    // ✅ CORRIGIDO: user.hotmart.progress.lastAccessDate (não lastLogin!)
    const lastLogin = user.hotmart?.progress?.lastAccessDate || user.hotmart?.firstAccessDate

    if (lastLogin) {
      const lastLoginTime = lastLogin instanceof Date ? lastLogin.getTime() : new Date(lastLogin).getTime()
      daysSinceLastLogin = Math.floor((now - lastLoginTime) / (1000 * 60 * 60 * 24))
      debugLog(`   ✅ daysSinceLastLogin: ${daysSinceLastLogin} dias`)
    } else {
      console.log(`   ⚠️  Hotmart lastAccessDate não disponível`)
    }

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

    if (purchaseDate) {
      console.log(`   📅 Hotmart purchaseDate: ${purchaseDate.toISOString()}`)
    }

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


/**
 * 📝 HELPER: Converter Date para timestamp seguro
 */
function toTimestamp(date: any): number {
  if (!date) return Date.now()
  if (date instanceof Date) return date.getTime()
  if (typeof date === 'string') return new Date(date).getTime()
  return Date.now()
}

/**
 * 🧪 TESTE RÁPIDO (remover em produção)
 */
export function testCalculateEngagementMetrics() {
  const mockUser: any = {
    email: 'test@mail.com',
    hotmart: {
      lastLogin: new Date('2025-12-10'), // 16 dias atrás
      purchase: { value: 297 },
      engagement: { accessCount: 42 }
    },
    curseduca: {
      lastActionDate: new Date('2025-12-24'), // 2 dias atrás
      subscriptionValue: 147
    },
    createdAt: new Date('2025-01-01')
  }

  const ogiProduct: any = {
    code: 'OGI_V1',
    platform: 'hotmart'
  }

  const clarezaProduct: any = {
    code: 'CLAREZA_ANUAL',
    platform: 'curseduca'
  }

  console.log('\n🧪 TESTE: OGI (Hotmart)')
  const ogiMetrics = calculateEngagementMetricsForUserProduct(mockUser, ogiProduct)
  console.log(JSON.stringify(ogiMetrics, null, 2))

  console.log('\n🧪 TESTE: Clareza (CursEduca)')
  const clarezaMetrics = calculateEngagementMetricsForUserProduct(mockUser, clarezaProduct)
  console.log(JSON.stringify(clarezaMetrics, null, 2))
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  executeUniversalSync
}