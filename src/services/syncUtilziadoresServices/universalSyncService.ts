// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/universalSync.service.ts
// Service: Universal Sync - Unifica Manual + Automático
// ════════════════════════════════════════════════════════════

import syncReportsService from './syncReports.service'
import SyncHistory from '../../models/SyncModels/SyncHistory'
import User from '../../models/user'
import type { SyncType, TriggerType } from '../../models/SyncModels/SyncReport'

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
  progress?: {
    completed?: number
    lessons?: Array<{
      pageId?: string
      pageName?: string
      isCompleted?: boolean
      completedDate?: Date | string | null
    }>
  }
  accessCount?: number | string
  engagementLevel?: string

  // CURSEDUCA
  curseducaUserId?: string
  curseducaUuid?: string
  groupId?: string
  groupName?: string

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

  // mantidos para logs/cleanup, mas não usados como argumentos "string" diretamente
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

  // IDs "definitivos" (string) depois de criados
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
    // STEP 2: CRIAR SYNCHISTORY (BACKWARD COMPATIBILITY)
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
      // eslint-disable-next-line no-await-in-loop
      const batch = sourceArray.slice(i, i + config.batchSize)
      const batchNumber = Math.floor(i / config.batchSize) + 1
      const totalBatches = Math.ceil(sourceArray.length / config.batchSize)

      console.log(`📦 [UniversalSync] Processando batch ${batchNumber}/${totalBatches} (${batch.length} itens)`)

      // eslint-disable-next-line no-await-in-loop
      await syncReportsService.addReportLog(
        rid,
        'info',
        `Processando batch ${batchNumber}/${totalBatches}`,
        { batchSize: batch.length, startIndex: i }
      )

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]

        try {
          // eslint-disable-next-line no-await-in-loop
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

          // eslint-disable-next-line no-await-in-loop
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
        // eslint-disable-next-line no-await-in-loop
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
    'stats.errors': stats.errors + 1  // +1 para contar o erro fatal
  })
}

    throw err
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: PROCESS SINGLE ITEM
// ═══════════════════════════════════════════════════════════

interface ProcessItemResult {
  action: 'inserted' | 'updated' | 'unchanged' | 'skipped'
  userId?: string
}

const processSyncItem = async (
  item: UniversalSourceItem,
  config: UniversalSyncConfig
): Promise<ProcessItemResult> => {
  if (!item.email || !item.email.trim()) {
    throw new Error('Item sem email')
  }

  const email = normalizeEmail(item.email)
  const name = item.name && item.name.trim() ? item.name.trim() : email

  // Buscar ou criar user
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

  // _id pode vir como unknown nos typings do mongoose -> converter sempre para string
  const userIdStr = String(user._id)

  const updateFields: Record<string, unknown> = {}
  let needsUpdate = false

  // Atualizar nome se diferente
  if (name && user.name !== name) {
    updateFields.name = name
    needsUpdate = true
  }

  // ═══════════════════════════════════════════════════════════
  // HOTMART - Schema Segregado
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'hotmart') {
    if (item.hotmartUserId) {
      updateFields['hotmart.hotmartUserId'] = item.hotmartUserId
      needsUpdate = true
    }

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

    if (item.plusAccess) {
      updateFields['hotmart.plusAccess'] = item.plusAccess
      needsUpdate = true
    }

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

    if (item.accessCount !== undefined || item.engagementLevel) {
      updateFields['hotmart.engagement'] = {
        accessCount: toNumber(item.accessCount, 0),
        engagementLevel: item.engagementLevel || 'NONE',
        engagementScore: 0,
        calculatedAt: new Date()
      }
      needsUpdate = true
    }

    // Metadados (é normal atualizar sempre)
    updateFields['hotmart.lastSyncAt'] = new Date()
    updateFields['hotmart.syncVersion'] = '3.0'
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.hotmart.lastSync'] = new Date()
    updateFields['metadata.sources.hotmart.version'] = '3.0'
    needsUpdate = true
  }

  // ═══════════════════════════════════════════════════════════
  // CURSEDUCA - Schema Segregado
  // ═══════════════════════════════════════════════════════════
  if (config.syncType === 'curseduca') {
    if (item.curseducaUserId) {
      updateFields['curseduca.curseducaUserId'] = item.curseducaUserId
      needsUpdate = true
    }

    if (item.curseducaUuid) {
      updateFields['curseduca.curseducaUuid'] = item.curseducaUuid
      needsUpdate = true
    }

    if (item.groupId) {
      updateFields['curseduca.groups'] = [
        {
          groupId: item.groupId,
          groupName: item.groupName,
          joinedAt: new Date()
        }
      ]
      needsUpdate = true
    }

    updateFields['curseduca.lastSyncAt'] = new Date()
    updateFields['metadata.updatedAt'] = new Date()
    updateFields['metadata.sources.curseduca.lastSync'] = new Date()
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
  // APLICAR UPDATES
  // ═══════════════════════════════════════════════════════════
  if (needsUpdate) {
    await User.findByIdAndUpdate(userIdStr, { $set: updateFields })
    console.log(`🔄 [UniversalSync] User atualizado: ${user.email}`)
    return { action: isNew ? 'inserted' : 'updated', userId: userIdStr }
  }

  return { action: isNew ? 'inserted' : 'unchanged', userId: userIdStr }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  executeUniversalSync
}
