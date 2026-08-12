import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import { successResponse } from '../../contracts/responseContract'
import { HotmartNotConfiguredError } from '../../services/classes/hotmartClubClient'
import type { HotmartClassSyncService } from '../../services/classes/hotmartClassSync.service'

type SyncService = Pick<HotmartClassSyncService, 'syncClasses'>
type CheckService = Pick<HotmartClassSyncService, 'checkHistory'>
type CompleteService = Pick<HotmartClassSyncService, 'completeSync'>

// Missing Hotmart configuration is a stable 503 (never a 400 or a real-tenant
// fallback); any other failure is the handler's own 500 SEC-10 code.
function toHttpError(error: unknown, code: string, publicMessage: string): HttpError {
  if (error instanceof HotmartNotConfiguredError) {
    return new HttpError({
      status: 503,
      code: 'HOTMART_SYNC_NOT_CONFIGURED',
      publicMessage: 'Sincronização Hotmart não configurada.',
      cause: error,
    })
  }
  return new HttpError({ status: 500, code, publicMessage, cause: error })
}

export function createSyncHotmartClassesController(service: SyncService): RequestHandler {
  return async (_req, res, next) => {
    try {
      const result = await service.syncClasses()
      res.status(200).json(successResponse({ stats: result.stats, classIds: result.classIds }, { message: 'Sincronização de turmas Hotmart concluída!', timestamp: result.timestamp }))
    } catch (error) {
      next(toHttpError(error, 'HOTMART_CLASS_SYNC_FAILED', 'Erro na sincronização de turmas.'))
    }
  }
}

export function createCheckAndUpdateClassHistoryController(service: CheckService): RequestHandler {
  return async (_req, res, next) => {
    try {
      const result = await service.checkHistory()
      res.json(successResponse({ stats: result.stats, errors: result.errors }, { message: 'Check-up de turmas concluído e histórico atualizado com sucesso!' }))
    } catch (error) {
      next(toHttpError(error, 'HOTMART_CLASS_HISTORY_CHECK_FAILED', 'Erro ao verificar e atualizar turmas.'))
    }
  }
}

export function createSyncCompleteController(service: CompleteService): RequestHandler {
  return async (_req, res, next) => {
    try {
      const result = await service.completeSync()
      res.json(successResponse({ stats: result.stats, syncId: result.syncId }, { message: 'Sincronização completa de turmas e histórico realizada com sucesso', timestamp: result.timestamp }))
    } catch (error) {
      next(toHttpError(error, 'HOTMART_COMPLETE_SYNC_FAILED', 'Erro na sincronização completa.'))
    }
  }
}
