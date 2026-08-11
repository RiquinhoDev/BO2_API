import type { NextFunction, Request, Response } from 'express'
import { internalError } from '../security/errorHandling'
import { successResponse } from '../contracts/responseContract'
import {
  createGuruInactivationReadService,
  type GuruInactivationReadService,
} from '../services/guru/guruInactivationRead.service'
import { mongooseGuruInactivationReadRepository } from '../services/guru/mongooseGuruInactivationRead.repository'

export type { GuruInactivationReadService }

export const createGuruInactivationReadHandlers = (
  service: GuruInactivationReadService,
) => ({
  async listPendingInactivation(
    _req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      return res.json(successResponse(await service.listPending()))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao listar inativações pendentes',
        'GURU_INACTIVATION_PENDING_LIST_FAILED',
        error,
      ))
    }
  },

  async getInactivationStats(
    _req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      return res.json(successResponse(await service.getStats()))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao obter estatísticas de inativação',
        'GURU_INACTIVATION_STATS_FAILED',
        error,
      ))
    }
  },

  async listInactivated(req: Request, res: Response, next: NextFunction) {
    try {
      return res.json(successResponse(await service.listInactive(req.query)))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao listar inativações concluídas',
        'GURU_INACTIVATION_INACTIVE_LIST_FAILED',
        error,
      ))
    }
  },
})

const handlers = createGuruInactivationReadHandlers(
  createGuruInactivationReadService(mongooseGuruInactivationReadRepository),
)

export const {
  listPendingInactivation,
  getInactivationStats,
  listInactivated,
} = handlers
