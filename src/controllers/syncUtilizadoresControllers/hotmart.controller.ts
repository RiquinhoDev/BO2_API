// src/controllers/hotmart.controller.ts
// ✅ UNIFICADO: hotmart.controller.ts + hotmartV2.controller.ts + Universal Sync endpoints

import { Request, Response } from 'express'
import { isDevelopmentRuntime } from '../../services/requestDrivenRuntimeConfig'
import type { AnyBulkWriteOperation } from 'mongoose'
import { Class, SyncHistory, User } from '../../models'
import type { IUserHistory } from '../../models/UserHistory'
import type { ISyncHistory } from '../../models/SyncHistory'
import { ensureUserHistoryModel } from '../../models/UserHistory'
import { calculateCombinedEngagement } from '../../utils/engagementCalculator'
import hotmartAdapter from '../../services/syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import { normalizeEngagementLevel } from '../../services/syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import universalSyncService from '../../services/syncUtilizadoresServices/universalSync'
import { SyncError, SyncProgress, SyncWarning } from '../../types/universalSync.types'
import {
  hotmartLegacyClient,
  type HotmartApiUser,
  type HotmartLesson
} from '../../services/hotmart/hotmartLegacyClient'

type ProgressLesson = {
  pageId: string
  pageName: string
  moduleName: string
  isModuleExtra: boolean
  isCompleted: boolean
  completedDate?: Date
}

type ProgressData = {
  completedPercentage: number
  total: number
  completed: number
  lessons: ProgressLesson[]
  lastUpdated: Date
}

type HotmartUpdateFields = Record<string, unknown> & {
  'hotmart.enrolledClasses': Array<{
    classId: string
    className: string
    source: 'hotmart'
    isActive: boolean
    enrolledAt: Date
  }>
}

type UserBulkOperation = {
  updateOne: {
    filter: { email: string }
    update: { $set: HotmartUpdateFields }
    upsert: boolean
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

const calculateProgress = (lessons: HotmartLesson[]): Omit<ProgressData, 'lastUpdated'> => {
  if (lessons.length === 0) {
    return { completedPercentage: 0, total: 0, completed: 0, lessons: [] }
  }

  const completed = lessons.filter(lesson => lesson.is_completed).length
  const total = lessons.length
  const completedPercentage = Math.round((completed / total) * 100)

  return {
    completedPercentage,
    total,
    completed,
    lessons: lessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    }))
  }
}

function convertUnixTimestamp(timestamp: unknown): Date | null {
  if (!timestamp) return null

  if (typeof timestamp === 'string' && timestamp.includes('T') && timestamp.includes('Z')) {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      if (year < 2000 || year > 2030) {
        console.warn(`Data ISO inválida detectada: ${timestamp} (ano: ${year}). Retornando null.`)
        return null
      }
      return date
    }
    return null
  }

  const numTimestamp = typeof timestamp === 'string'
    ? parseInt(timestamp, 10)
    : typeof timestamp === 'number'
      ? timestamp
      : Number.NaN
  if (isNaN(numTimestamp) || numTimestamp <= 0) return null

  const timestampMs = numTimestamp < 1e12 ? numTimestamp * 1000 : numTimestamp
  const date = new Date(timestampMs)

  const year = date.getFullYear()
  if (year < 2000 || year > 2030) {
    console.warn(
      `Data suspeita detectada: ${date.toISOString()} (timestamp: ${timestamp}). Retornando null para evitar dados inválidos.`
    )
    return null
  }

  return date
}

// ✅ SYNC COMPLETO (legacy)
export const syncHotmartUsers = async (req: Request, res: Response): Promise<void> => {
  let syncRecord: ISyncHistory | null = null

  try {
    syncRecord = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        includeProgress: true,
        includeLessons: true,
        includeEngagement: true,
        syncType: 'complete_with_progress_classes_engagement'
      }
    })

    console.log(`🚀 [${syncRecord._id}] Iniciando sincronização Hotmart com pré-cálculo de engagement...`)

    const accessToken = await hotmartLegacyClient.getAccessToken()

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      'metadata.currentStep': 'Token de acesso obtido',
      'metadata.progress': 10
    })

    let allUsers: HotmartApiUser[] = []
    let nextPageToken: string | null = null
    let pageCount = 0
    const batchSize = 50

    do {
      pageCount++

      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': `Buscando utilizadores - Página ${pageCount}`,
        'metadata.progress': 10 + (pageCount * 2)
      })

      const page = await hotmartLegacyClient.listUsersPage(
        accessToken,
        nextPageToken || undefined
      )
      const users = page.users
      allUsers = allUsers.concat(users)
      nextPageToken = page.nextPageToken

      await new Promise(resolve => setTimeout(resolve, 200))

    } while (nextPageToken)

    console.log(`📊 [${syncRecord._id}] Total encontrados: ${allUsers.length}`)

    if (allUsers.length === 0) throw new Error('Nenhum utilizador encontrado na API da Hotmart')

    let totalProcessed = 0
    let totalWithProgress = 0
    let totalWithClasses = 0
    let totalWithEngagement = 0
    let totalInserted = 0
    let totalUpdated = 0
    let totalErrors = 0
    const errors: string[] = []

    const uniqueClassIds = new Set<string>()

    for (let i = 0; i < allUsers.length; i += batchSize) {
      const batch = allUsers.slice(i, i + batchSize)
      const bulkOperations: UserBulkOperation[] = []

      const progressPercentage = 50 + ((i / allUsers.length) * 45)
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': `Processando utilizadores ${i + 1}-${Math.min(i + batchSize, allUsers.length)}`,
        'metadata.progress': progressPercentage,
        'metadata.processed': totalProcessed,
        'metadata.withProgress': totalWithProgress,
        'metadata.withClasses': totalWithClasses,
        'metadata.withEngagement': totalWithEngagement
      })

      for (const apiUser of batch) {
        try {
          if (!apiUser.email || !apiUser.email.trim()) {
            totalErrors++
            errors.push(`Utilizador sem email válido: ${JSON.stringify(apiUser)}`)
            continue
          }
          if (!apiUser.name || !apiUser.name.trim()) {
            totalErrors++
            errors.push(`Utilizador sem nome válido: ${apiUser.email}`)
            continue
          }

          const hotmartId = apiUser.id || apiUser.user_id || apiUser.uid || apiUser.code
          if (!hotmartId) {
            totalErrors++
            errors.push(`Utilizador sem ID Hotmart: ${apiUser.email}`)
            continue
          }

          const existingUser = await User.findOne({ email: apiUser.email.toLowerCase().trim() })
          console.log(`🔍 [${syncRecord._id}] Verificando utilizador: ${apiUser.email}`)
          console.log(`   • Utilizador existente: ${!!existingUser}`)
          if (existingUser) {
            console.log(`   • Tem CursEduca: ${!!existingUser.curseduca?.curseducaUserId}`)
            console.log(`   • Tem Hotmart: ${!!existingUser.hotmart?.hotmartUserId}`)
          }

          const userClassId = apiUser.class_id || null
          if (userClassId) {
            uniqueClassIds.add(userClassId)
            totalWithClasses++
            console.log(`🎓 [${syncRecord._id}] Turma encontrada: ${apiUser.email} → ${userClassId}`)
          }

          let progressData: ProgressData = {
            completedPercentage: 0,
            total: 0,
            completed: 0,
            lessons: [],
            lastUpdated: new Date()
          }

          try {
            const userLessons = await hotmartLegacyClient.listUserLessons(hotmartId, accessToken)
            if (userLessons.length > 0) {
              const calculated = calculateProgress(userLessons)
              progressData = {
                completedPercentage: calculated.completedPercentage,
                total: calculated.total,
                completed: calculated.completed,
                lessons: calculated.lessons,
                lastUpdated: new Date()
              }
              totalWithProgress++
            }
          } catch (progressError) {
            console.warn(`⚠️ [${syncRecord._id}] Erro ao buscar progresso de ${apiUser.email}:`, progressError)
          }

          const normalizedEmail = apiUser.email.trim().toLowerCase()

          bulkOperations.push({
            updateOne: {
              filter: { email: normalizedEmail },
              update: {
                $set: {
                  email: normalizedEmail,
                  name: apiUser.name.trim(),

                  'hotmart.hotmartUserId': hotmartId,
                  'hotmart.purchaseDate': convertUnixTimestamp(apiUser.purchase_date),
                  'hotmart.signupDate': convertUnixTimestamp(apiUser.signup_date) || new Date(),
                  'hotmart.plusAccess': apiUser.plus_access || 'WITHOUT_PLUS_ACCESS',
                  'hotmart.firstAccessDate': convertUnixTimestamp(apiUser.first_access_date),

                  'hotmart.enrolledClasses': userClassId ? [{
                    classId: userClassId,
                    className: `Turma ${userClassId}`,
                    source: 'hotmart',
                    isActive: true,
                    enrolledAt: convertUnixTimestamp(apiUser.purchase_date) || new Date()
                  }] : [],

                  'hotmart.progress': {
                    totalTimeMinutes: 0,
                    completedLessons: progressData.completed,
                    lessonsData: progressData.lessons.map(lesson => ({
                      lessonId: lesson.pageId,
                      title: lesson.pageName,
                      completed: lesson.isCompleted,
                      completedAt: lesson.completedDate,
                      timeSpent: 0
                    })),
                    lastAccessDate: convertUnixTimestamp(apiUser.last_access_date)
                  },

                  'hotmart.engagement': {
                    accessCount: Number(apiUser.access_count) || 0,
                    engagementLevel: normalizeEngagementLevel(apiUser.engagement),
                    engagementScore: 0,
                    calculatedAt: new Date()
                  },

                  'hotmart.lastSyncAt': new Date(),
                  'hotmart.syncVersion': '2.0',

                  'metadata.updatedAt': new Date(),
                  'metadata.sources.hotmart.lastSync': new Date(),
                  'metadata.sources.hotmart.version': '2.0'
                }
              },
              upsert: true
            }
          })

          totalProcessed++

        } catch (userError: unknown) {
          totalErrors++
          errors.push(`Erro ao processar ${apiUser.email || 'email_desconhecido'}: ${errorMessage(userError)}`)
        }

        await new Promise(resolve => setTimeout(resolve, 50))
      }

      try {
        if (bulkOperations.length > 0) {
          const UserHistoryModel = ensureUserHistoryModel()

          const emails = bulkOperations.map(op => op.updateOne?.filter?.email).filter(Boolean)
          const existingUsers = await User.find({ email: { $in: emails } })
            .select('email hotmart.enrolledClasses combined.classId combined.className')
            .lean()

          const existingUsersMap = new Map(existingUsers.map(user => [user.email, user]))
          const historyOperations: AnyBulkWriteOperation<IUserHistory>[] = []

          for (const operation of bulkOperations) {
            const email = operation.updateOne?.filter?.email
            const newSet = operation.updateOne?.update?.$set
            if (!email || !newSet) continue

            const existing = existingUsersMap.get(email)
            if (!existing) continue

            const prevClassId = existing?.hotmart?.enrolledClasses?.[0]?.classId || existing?.combined?.classId
            const nextClassId = newSet?.['hotmart.enrolledClasses']?.[0]?.classId

            if (nextClassId && prevClassId !== nextClassId) {
              historyOperations.push({
                insertOne: {
                  document: {
                    userId: existing._id,
                    userEmail: email,
                    changeType: 'CLASS_CHANGE',
                    previousValue: { classId: prevClassId, className: existing?.combined?.className },
                    newValue: { classId: nextClassId, className: `Turma ${nextClassId}` },
                    changeDate: new Date(),
                    source: 'HOTMART_SYNC',
                    syncId: syncRecord._id,
                    reason: 'Mudança de turma detectada na sincronização da Hotmart'
                  }
                }
              })
            }
          }

          if (historyOperations.length > 0) {
            try {
              await UserHistoryModel.bulkWrite(historyOperations, { ordered: false })
            } catch (historyError) {
              console.error(`❌ [${syncRecord._id}] Erro ao criar histórico:`, historyError)
            }
          }

          const result = await User.bulkWrite(bulkOperations, { ordered: false })
          totalInserted += result.upsertedCount || 0
          totalUpdated += result.modifiedCount || 0

          const batchEmails = bulkOperations.map(op => op.updateOne.filter.email)
          let successfulEngagement = 0
          const engagementErrors: string[] = []

          try {
            const batchUsers = await User.find(
              { email: { $in: batchEmails } },
              { _id: 1, email: 1, 'hotmart.engagement': 1, 'hotmart.progress': 1 }
            ).lean()

            for (const u of batchUsers) {
              try {
                const hotmartEngagement = u.hotmart?.engagement?.engagementLevel || 'NONE'
                const hotmartAccessCount = u.hotmart?.engagement?.accessCount || 0
                const hotmartProgress = u.hotmart?.progress || {}

                const engagementResult = calculateCombinedEngagement({
                  engagement: hotmartEngagement,
                  accessCount: hotmartAccessCount,
                  progress: hotmartProgress
                })

                await User.findByIdAndUpdate(u._id, {
                  'hotmart.engagement.engagementScore': engagementResult.score,
                  'hotmart.engagement.engagementLevel': engagementResult.level,
                  'hotmart.engagement.calculatedAt': new Date()
                })

                successfulEngagement++
              } catch (engagementError: unknown) {
                engagementErrors.push(`Erro engagement ${u.email || 'unknown'}: ${errorMessage(engagementError)}`)
              }

              await new Promise(resolve => setTimeout(resolve, 10))
            }
          } catch (batchEngagementError: unknown) {
            engagementErrors.push(`Erro geral: ${errorMessage(batchEngagementError)}`)
          }

          totalWithEngagement += successfulEngagement
          if (engagementErrors.length > 0) errors.push(...engagementErrors.slice(0, 5))

        } else {
          console.error(`❌ [${syncRecord._id}] Nenhuma operação para executar!`)
        }
      } catch (batchError: unknown) {
        totalErrors++
        errors.push(`Erro no lote ${i}-${i + batchSize}: ${errorMessage(batchError)}`)
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    let newClassesCreated = 0
    for (const classId of uniqueClassIds) {
      try {
        const existingClass = await Class.findOne({ classId })
        if (!existingClass) {
          await Class.create({
            classId,
            name: `Turma ${classId}`,
            description: `Turma sincronizada da Hotmart em ${new Date().toLocaleDateString('pt-PT')}`,
            source: 'hotmart_sync',
            isActive: true,
            studentCount: 0,
            lastSyncAt: new Date()
          })
          newClassesCreated++
        }
      } catch (classError: unknown) {
        errors.push(`Erro ao criar turma ${classId}: ${errorMessage(classError)}`)
      }
    }

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: 'completed',
      completedAt: new Date(),
      'metadata.currentStep': 'Sincronização concluída com engagement',
      'metadata.progress': 100,
      stats: {
        total: totalProcessed,
        added: totalInserted,
        updated: totalUpdated,
        conflicts: 0,
        errors: totalErrors
      },
      errorDetails: errors.length > 0 ? errors.slice(0, 50) : undefined
    })
// ✅ PATCH: Invalidar cache e rebuild stats
console.log('🔄 [HotmartUniversal] Invalidando cache e reconstruindo stats...')

const { clearUnifiedCache } = require('../../services/syncUtilizadoresServices/dualReadService')
clearUnifiedCache()

const { buildDashboardStats } = require('../../services/dashboardStatsBuilder.service')
await buildDashboardStats()

console.log('✅ [HotmartUniversal] Stats atualizados!')
    res.status(200).json({
      message: 'Sincronização Hotmart concluída com pré-cálculo de engagement!',
      stats: {
        total: totalProcessed,
        added: totalInserted,
        updated: totalUpdated,
        withProgress: totalWithProgress,
        withEngagement: totalWithEngagement,
        withClasses: totalWithClasses,
        newClassesCreated,
        uniqueClasses: uniqueClassIds.size,
        classIds: Array.from(uniqueClassIds),
        errors: totalErrors
      }
    })

  } catch (error: unknown) {
    console.error(`💥 [${syncRecord?._id}] ERRO CRÍTICO NA SINCRONIZAÇÃO:`, error)

    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'failed',
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [errorMessage(error)]
      })
    }

    res.status(500).json({
      message: 'Erro crítico na sincronização com Hotmart',
      error: errorMessage(error),
      details: errorStack(error)
    })
  }
}

// ✅ SYNC apenas progresso (legacy)
export const syncProgressOnly = async (req: Request, res: Response): Promise<void> => {
  let syncRecord: ISyncHistory | null = null

  try {
    syncRecord = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        includeProgress: true,
        includeLessons: true,
        syncType: 'progress_only'
      }
    })

    const accessToken = await hotmartLegacyClient.getAccessToken()

    const existingUsers = await User.find({
'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }

    }).select('_id email name hotmart.hotmartUserId')

    if (existingUsers.length === 0) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'completed',
        completedAt: new Date(),
        'metadata.currentStep': 'Nenhum utilizador com Hotmart ID encontrado',
        'metadata.progress': 100,
        stats: { total: 0, errors: 0 }
      })

      res.status(200).json({
        message: 'Nenhum utilizador com Hotmart ID encontrado para sincronização de progresso',
        stats: { total: 0, errors: 0 }
      })
      return
    }

    let totalProcessed = 0
    let totalWithProgress = 0
    let totalErrors = 0
    const errors: string[] = []

    for (const u of existingUsers) {
      try {
        const progressPercentage = (totalProcessed / existingUsers.length) * 100
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          'metadata.currentStep': `Atualizando progresso: ${u.email}`,
          'metadata.progress': progressPercentage,
          'metadata.processed': totalProcessed,
          'metadata.withProgress': totalWithProgress
        })

        const hotmartUserId = u.hotmart?.hotmartUserId
        if (!hotmartUserId) {
          totalErrors++
          errors.push(`User sem hotmartUserId: ${u.email}`)
          totalProcessed++
          continue
        }

        const userLessons = await hotmartLegacyClient.listUserLessons(hotmartUserId, accessToken)

        if (userLessons.length > 0) {
          totalWithProgress++
          const progressData = calculateProgress(userLessons)

          await User.findByIdAndUpdate(u._id, {
            'hotmart.progress': {
              totalTimeMinutes: 0,
              completedLessons: progressData.completed,
              lessonsData: progressData.lessons.map(lesson => ({
                lessonId: lesson.pageId,
                title: lesson.pageName,
                completed: lesson.isCompleted,
                completedAt: lesson.completedDate,
                timeSpent: 0
              })),
              lastAccessDate: new Date()
            },
            'hotmart.lastSyncAt': new Date(),
            'metadata.updatedAt': new Date(),
            'metadata.sources.hotmart.lastSync': new Date()
          })
        }

        totalProcessed++
      } catch (userError: unknown) {
        totalErrors++
        errors.push(`Erro ao atualizar progresso de ${u.email}: ${errorMessage(userError)}`)
        totalProcessed++
      }

      await new Promise(resolve => setTimeout(resolve, 150))
    }

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: 'completed',
      completedAt: new Date(),
      'metadata.progress': 100,
      'metadata.currentStep': 'Sincronização de progresso concluída',
      stats: { total: totalProcessed, errors: totalErrors },
      errorDetails: errors.length > 0 ? errors : undefined
    })

    res.status(200).json({
      message: 'Sincronização de progresso concluída!',
      stats: { total: totalProcessed, withProgress: totalWithProgress, errors: totalErrors }
    })

  } catch (error: unknown) {
    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'failed',
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [errorMessage(error)]
      })
    }

    res.status(500).json({ message: 'Erro na sincronização de progresso', error: errorMessage(error) })
  }
}

// ✅ Compatibilidade
export const findHotmartUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.query

    if (!email) {
      res.status(400).json({ message: 'Email é obrigatório' })
      return
    }

    const foundUser = await User.findOne({ email: String(email) })

    if (!foundUser) {
      res.status(404).json({ message: 'Utilizador não encontrado' })
      return
    }

    res.status(200).json({
      message: 'Utilizador encontrado',
      user: {
        id: foundUser._id,
        email: foundUser.email,
        name: foundUser.name,
        hotmartUserId: foundUser.hotmart?.hotmartUserId,
        status: foundUser.combined?.status,
        progress: foundUser.combined?.totalProgress
      }
    })
  } catch (error: unknown) {
    res.status(500).json({ message: 'Erro ao buscar utilizador', error: errorMessage(error) })
  }
}

// ✅ TESTE DA BD
export const testDatabaseConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await User.countDocuments()

    const testUser = await User.create({
      email: 'test-connection@example.com',
      name: 'Test Connection User'
    })

    await User.findByIdAndUpdate(testUser._id, { name: 'Test Updated' }, { new: true })
    await User.findByIdAndDelete(testUser._id)

    res.json({
      success: true,
      message: 'Todos os testes da BD passaram com sucesso',
      userCount,
      testPassed: true,
      connectionStatus: 'OK'
    })
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      message: 'Erro no teste da BD',
      error: errorMessage(error),
      connectionStatus: 'FAILED'
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ UNIVERSAL SYNC ENDPOINTS (NOVOS)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/hotmart/sync/universal
 * Sincronização Hotmart usando Universal Sync Service
 */
export const syncHotmartUsersUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('🚀 [HotmartUniversal] Iniciando sync via Universal Service...')

  try {
    console.log('📡 [HotmartUniversal] Buscando dados via Adapter...')

const hotmartData = await hotmartAdapter.fetchHotmartDataForSync({
  includeProgress: true,
  includeLessons: true,
  progressConcurrency: 5  // ✅ Aumentar de 2 para 5 (mais rápido mas mais carga API)
})

    console.log(`✅ [HotmartUniversal] ${hotmartData.length} utilizadores preparados`)

    if (hotmartData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum utilizador encontrado na Hotmart',
        data: { stats: { total: 0, inserted: 0, updated: 0, errors: 0 } }
      })
      return
    }

    console.log('⚡ [HotmartUniversal] Executando Universal Sync...')

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'Hotmart Universal Sync (Manual)',
      triggeredBy: 'MANUAL',
      triggeredByUser: req.user?.id,

      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,

      sourceData: hotmartData,

onProgress: (progress: SyncProgress) => {
  if (progress.current % 100 === 0 || progress.percentage === 100) {
    console.log(`📊 [HotmartUniversal] ${progress.percentage.toFixed(1)}% (${progress.current}/${progress.total})`)
  }
},

onError: (error: SyncError) => {
  console.error(`❌ [HotmartUniversal] Erro: ${error.message}`)
},

onWarning: (warning: SyncWarning) => {
  console.warn(`⚠️ [HotmartUniversal] Aviso: ${warning.message}`)
}

    })

    console.log('✅ [HotmartUniversal] Sync concluída!')
    console.log(`   ⏱️ Duração: ${result.duration}s`)
    console.log(`   ✅ Inseridos: ${result.stats.inserted}`)
    console.log(`   🔄 Atualizados: ${result.stats.updated}`)
    console.log(`   ❌ Erros: ${result.stats.errors}`)

    res.status(200).json({
      success: result.success,
      message: result.success
        ? 'Sincronização via Universal Service concluída com sucesso!'
        : 'Sincronização concluída com erros',
      data: {
        reportId: result.reportId,
        syncHistoryId: result.syncHistoryId,
        stats: result.stats,
        duration: result.duration,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length,
        reportUrl: `/api/sync/reports/${result.reportId}`,
        syncHistoryUrl: `/api/sync/history/${result.syncHistoryId}`
      },
      _universalSync: true,
      _version: '3.0'
    })

  } catch (error: unknown) {
    console.error('❌ [HotmartUniversal] Erro fatal:', error)

    res.status(500).json({
      success: false,
      message: 'Erro ao executar sincronização via Universal Service',
      error: errorMessage(error),
      stack: isDevelopmentRuntime() ? errorStack(error) : undefined
    })
  }
}

/**
 * POST /api/hotmart/sync/universal/progress
 * Sincronizar apenas progresso usando Universal Sync
 */
export const syncProgressOnlyUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('📊 [HotmartProgress] Iniciando sync de progresso via Universal...')

  try {
    const existingUsers = await User.find({
'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }

    }).select('hotmart.hotmartUserId email name').lean()

    console.log(`📊 [HotmartProgress] ${existingUsers.length} utilizadores com Hotmart ID`)

    if (existingUsers.length === 0) {
      res.status(200).json({
        success: true,
        message: 'Nenhum utilizador com Hotmart ID encontrado',
        data: { stats: { total: 0 } }
      })
      return
    }

    const userIds = existingUsers
      .map(user => user.hotmart?.hotmartUserId)
      .filter((userId): userId is string => Boolean(userId))

    const progressMap = await hotmartAdapter.fetchProgressForExistingUsers(userIds)

    const progressData = existingUsers.map(user => {
      const hotmartId = user.hotmart?.hotmartUserId
      const progress = hotmartId ? progressMap.get(hotmartId) : undefined

      return {
        email: user.email,
        name: user.name,
        hotmartUserId: hotmartId,
        progress: progress || undefined
      }
    })

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'Hotmart Progress Sync (Universal)',
      triggeredBy: 'MANUAL',
      triggeredByUser: req.user?.id,
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 100,
      sourceData: progressData
    })

    res.status(200).json({
      success: result.success,
      message: 'Progresso sincronizado via Universal Service!',
      data: {
        reportId: result.reportId,
        stats: result.stats,
        duration: result.duration,
        withProgress: progressMap.size
      },
      _universalSync: true
    })

  } catch (error: unknown) {
    console.error('❌ [HotmartProgress] Erro:', error)
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}

/**
 * GET /api/hotmart/sync/compare
 * Comparar resultados: Legacy vs Universal
 */
export const compareSyncMethods = async (req: Request, res: Response): Promise<void> => {
  try {
    const SyncReport = (await import('../../models/SyncModels/SyncReport')).default

    const legacyHistory = await SyncHistory.find({ type: 'hotmart' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats')
      .lean()

    const universalReports = await SyncReport.find({ syncType: 'hotmart' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats duration')
      .lean()

    res.json({
      success: true,
      data: {
        legacy: {
          count: legacyHistory.length,
          latest: legacyHistory[0],
          all: legacyHistory
        },
        universal: {
          count: universalReports.length,
          latest: universalReports[0],
          all: universalReports
        },
        comparison: {
          avgDurationLegacy: legacyHistory.reduce((sum, history) => {
            const duration = history.completedAt && history.startedAt
              ? (new Date(history.completedAt).getTime() - new Date(history.startedAt).getTime()) / 1000
              : 0
            return sum + duration
          }, 0) / (legacyHistory.length || 1),

          avgDurationUniversal: universalReports.reduce(
            (sum, report) => sum + (report.duration || 0),
            0
          ) / (universalReports.length || 1)
        }
      }
    })
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}
