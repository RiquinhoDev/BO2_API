import type { NextFunction, Request, Response } from 'express'
import { operationalSuccessResponse } from '../../contracts/responseContract'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { internalError } from '../../security/errorHandling'
import { User } from '../../models'
import hotmartAdapter from '../../services/syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import universalSyncService from '../../services/syncUtilizadoresServices/universalSync'
import type { SyncError, SyncProgress, SyncWarning } from '../../types/universalSync.types'
import logger from '../../utils/logger'

function forwardHotmartError(
  next: NextFunction,
  error: unknown,
  publicMessage: string,
  code: string,
): void {
  if (error instanceof IntegrationUnavailableError) {
    next(error)
    return
  }
  next(internalError(publicMessage, code, error))
}
export const syncHotmartUsersUniversal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  logger.info('[HotmartUniversal] Iniciando sync via Universal Service')

  try {
    const hotmartData = await hotmartAdapter.fetchHotmartDataForSync({
      includeProgress: true,
      includeLessons: true,
      progressConcurrency: 5
    })

    logger.info('[HotmartUniversal] Utilizadores preparados', { total: hotmartData.length })

    if (hotmartData.length === 0) {
      res.status(200).json(operationalSuccessResponse({
        completed: false,
        message: 'Nenhum utilizador encontrado na Hotmart',
        data: { stats: { total: 0, inserted: 0, updated: 0, errors: 0 } }
      }))
      return
    }

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
          logger.info('[HotmartUniversal] Progresso', {
            current: progress.current,
            total: progress.total,
            percentage: progress.percentage
          })
        }
      },
      onError: (error: SyncError) => {
        logger.error('[HotmartUniversal] Erro de item', { error })
      },
      onWarning: (warning: SyncWarning) => {
        logger.warn('[HotmartUniversal] Aviso', { warning })
      }
    })

    logger.info('[HotmartUniversal] Sync concluída', {
      duration: result.duration,
      inserted: result.stats.inserted,
      updated: result.stats.updated,
      errors: result.stats.errors
    })

    res.status(200).json(operationalSuccessResponse({
      completed: result.success,
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
    }))
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao executar sincronização via Universal Service', 'HOTMART_UNIVERSAL_SYNC_FAILED')
  }
}

export const syncProgressOnlyUniversal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  logger.info('[HotmartProgress] Iniciando sync de progresso via Universal')

  try {
    const existingUsers = await User.find({
      'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }
    }).select('hotmart.hotmartUserId email name').lean()

    logger.info('[HotmartProgress] Utilizadores com Hotmart ID', { total: existingUsers.length })

    if (existingUsers.length === 0) {
      res.status(200).json(operationalSuccessResponse({
        completed: true,
        message: 'Nenhum utilizador com Hotmart ID encontrado',
        data: { stats: { total: 0 } }
      }))
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

    res.status(200).json(operationalSuccessResponse({
      completed: result.success,
      message: 'Progresso sincronizado via Universal Service!',
      data: {
        reportId: result.reportId,
        stats: result.stats,
        duration: result.duration,
        withProgress: progressMap.size
      },
    }))
  } catch (error: unknown) {
    forwardHotmartError(next, error, 'Erro ao sincronizar progresso Hotmart', 'HOTMART_PROGRESS_SYNC_FAILED')
  }
}
