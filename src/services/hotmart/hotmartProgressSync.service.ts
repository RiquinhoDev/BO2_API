import { SyncHistory, User } from '../../models'
import type { ISyncHistory } from '../../models/SyncHistory'
import { assertProviderReadBatchSize } from '../../security/providerReadBatchPolicy'
import { hotmartLegacyClient } from './hotmartLegacyClient'
import { calculateHotmartProgress } from './hotmartProgress'

type ProgressSyncResponse = {
  status: 200 | 500
  body: {
    message: string
    stats?: { total: number; withProgress?: number; errors: number }
    error?: string
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export async function executeHotmartProgressSync(): Promise<ProgressSyncResponse> {
  let syncRecord: ISyncHistory | null = null

  try {
    syncRecord = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: new Date(),
      metadata: { includeProgress: true, includeLessons: true, syncType: 'progress_only' }
    })
    const accessToken = await hotmartLegacyClient.getAccessToken()
    const existingUsers = await User.find({
      'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }
    }).select('_id email name hotmart.hotmartUserId')
    assertProviderReadBatchSize(existingUsers.length, 'hotmart-progress')

    if (existingUsers.length === 0) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'completed',
        completedAt: new Date(),
        'metadata.currentStep': 'Nenhum utilizador com Hotmart ID encontrado',
        'metadata.progress': 100,
        stats: { total: 0, errors: 0 }
      })
      return {
        status: 200,
        body: {
          message: 'Nenhum utilizador com Hotmart ID encontrado para sincronização de progresso',
          stats: { total: 0, errors: 0 }
        }
      }
    }

    let totalProcessed = 0
    let totalWithProgress = 0
    let totalErrors = 0
    const errors: string[] = []

    for (const user of existingUsers) {
      try {
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          'metadata.currentStep': `Atualizando progresso: ${user.email}`,
          'metadata.progress': (totalProcessed / existingUsers.length) * 100,
          'metadata.processed': totalProcessed,
          'metadata.withProgress': totalWithProgress
        })
        const hotmartUserId = user.hotmart?.hotmartUserId
        if (!hotmartUserId) {
          totalErrors++
          errors.push(`User sem hotmartUserId: ${user.email}`)
          totalProcessed++
          continue
        }

        const lessons = await hotmartLegacyClient.listUserLessons(hotmartUserId, accessToken)
        if (lessons.length > 0) {
          totalWithProgress++
          const progress = calculateHotmartProgress(lessons)
          await User.findByIdAndUpdate(user._id, {
            'hotmart.progress': {
              totalTimeMinutes: 0,
              completedLessons: progress.completed,
              lessonsData: progress.lessons.map(lesson => ({
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
      } catch (error: unknown) {
        totalErrors++
        errors.push(`Erro ao atualizar progresso de ${user.email}: ${errorMessage(error)}`)
        totalProcessed++
      }
      await sleep(150)
    }

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: 'completed',
      completedAt: new Date(),
      'metadata.progress': 100,
      'metadata.currentStep': 'Sincronização de progresso concluída',
      stats: { total: totalProcessed, errors: totalErrors },
      errorDetails: errors.length > 0 ? errors : undefined
    })
    return {
      status: 200,
      body: {
        message: 'Sincronização de progresso concluída!',
        stats: { total: totalProcessed, withProgress: totalWithProgress, errors: totalErrors }
      }
    }
  } catch (error: unknown) {
    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'failed',
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [errorMessage(error)]
      })
    }
    return {
      status: 500,
      body: { message: 'Erro na sincronização de progresso', error: errorMessage(error) }
    }
  }
}
