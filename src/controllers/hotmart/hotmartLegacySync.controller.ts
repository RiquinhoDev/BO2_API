import type { NextFunction, Request, Response } from 'express'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { internalError } from '../../security/errorHandling'
import type { AnyBulkWriteOperation } from 'mongoose'
import { Class, SyncHistory, User } from '../../models'
import type { IUserHistory } from '../../models/UserHistory'
import type { ISyncHistory } from '../../models/SyncHistory'
import { ensureUserHistoryModel } from '../../models/UserHistory'
import { calculateCombinedEngagement } from '../../utils/engagementCalculator'
import { normalizeEngagementLevel } from '../../services/syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import { clearUnifiedCache } from '../../services/syncUtilizadoresServices/dualReadService'
import { buildDashboardStats } from '../../services/dashboardStatsBuilder.service'
import { hotmartLegacyClient, type HotmartApiUser } from '../../services/hotmart/hotmartLegacyClient'
import { calculateHotmartProgress, type HotmartProgressLesson } from '../../services/hotmart/hotmartProgress'
import logger from '../../utils/logger'
type ProgressData = {
  completedPercentage: number
  total: number
  completed: number
  lessons: HotmartProgressLesson[]
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

function convertUnixTimestamp(timestamp: unknown): Date | null {
  if (!timestamp) return null

  if (typeof timestamp === 'string' && timestamp.includes('T') && timestamp.includes('Z')) {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      if (year < 2000 || year > 2030) {
        logger.warn(`Data ISO inválida detectada: ${timestamp} (ano: ${year}). Retornando null.`)
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
    logger.warn(
      `Data suspeita detectada: ${date.toISOString()} (timestamp: ${timestamp}). Retornando null para evitar dados inválidos.`
    )
    return null
  }

  return date
}

// ✅ SYNC COMPLETO (legacy)
export const syncHotmartUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    logger.info(`🚀 [${syncRecord._id}] Iniciando sincronização Hotmart com pré-cálculo de engagement...`)

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

    logger.info(`📊 [${syncRecord._id}] Total encontrados: ${allUsers.length}`)

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
          logger.info(`🔍 [${syncRecord._id}] Verificando utilizador: ${apiUser.email}`)
          logger.info(`   • Utilizador existente: ${!!existingUser}`)
          if (existingUser) {
            logger.info(`   • Tem CursEduca: ${!!existingUser.curseduca?.curseducaUserId}`)
            logger.info(`   • Tem Hotmart: ${!!existingUser.hotmart?.hotmartUserId}`)
          }

          const userClassId = apiUser.class_id || null
          if (userClassId) {
            uniqueClassIds.add(userClassId)
            totalWithClasses++
            logger.info(`🎓 [${syncRecord._id}] Turma encontrada: ${apiUser.email} → ${userClassId}`)
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
              const calculated = calculateHotmartProgress(userLessons)
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
            logger.warn(`⚠️ [${syncRecord._id}] Erro ao buscar progresso de ${apiUser.email}:`, progressError)
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
              logger.error(`❌ [${syncRecord._id}] Erro ao criar histórico:`, historyError)
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
          logger.error(`❌ [${syncRecord._id}] Nenhuma operação para executar!`)
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
logger.info('🔄 [HotmartUniversal] Invalidando cache e reconstruindo stats...')

clearUnifiedCache()

await buildDashboardStats()

logger.info('✅ [HotmartUniversal] Stats atualizados!')
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
    logger.error(`💥 [${syncRecord?._id}] ERRO CRÍTICO NA SINCRONIZAÇÃO:`, error)

    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'failed',
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [errorMessage(error)]
      })
    }

    if (error instanceof IntegrationUnavailableError) {
      next(error)
      return
    }
    next(internalError(
      'Erro crítico na sincronização com Hotmart',
      'HOTMART_LEGACY_SYNC_FAILED',
      error,
    ))
  }
}
