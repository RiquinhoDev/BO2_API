import { successResponse } from '../contracts/responseContract'
import type { NextFunction, Request, Response } from 'express'
import { internalError } from '../security/errorHandling'
import { axiosCurseducaMemberClient } from '../services/guru/curseducaMember.client'
import {
  createGuruInactivationMaintenanceService,
  type GuruInactivationMaintenanceService,
} from '../services/guru/guruInactivationMaintenance.service'
import { mongooseGuruInactivationMaintenanceRepository } from '../services/guru/mongooseGuruInactivationMaintenance.repository'

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string')

export const createGuruInactivationMaintenanceHandlers = (
  service: GuruInactivationMaintenanceService,
) => ({
  async cleanupInactivationList(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await service.cleanup()
      const totalCleaned = result.cleanedInactive + result.cleanedGuruActive
      return res.json(successResponse(
        {
          cleaned: {
            total: totalCleaned,
            curseducaInactive: result.cleanedInactive,
            guruActive: result.cleanedGuruActive,
          },
          kept: result.kept,
          total: result.total,
          cleanedDetails: result.details.slice(0, 50),
        },
        {
          message: `Limpeza concluída: ${totalCleaned} removidos (${result.cleanedInactive} CursEduca INACTIVE, ${result.cleanedGuruActive} Guru ACTIVE), ${result.kept} mantidos`,
        },
      ))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao limpar lista de inativação',
        'GURU_INACTIVATION_CLEANUP_FAILED',
        error,
      ))
    }
  },

  async diagnoseUsers(req: Request, res: Response, next: NextFunction) {
    const emails = req.body?.emails
    if (!stringArray(emails)) {
      return res.status(400).json({
        success: false,
        message: 'Campo "emails" obrigatório (array de strings)',
      })
    }
    try {
      return res.json(successResponse(await service.diagnose(emails)))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao diagnosticar utilizadores',
        'GURU_INACTIVATION_DIAGNOSE_FAILED',
        error,
      ))
    }
  },
})

const handlers = createGuruInactivationMaintenanceHandlers(
  createGuruInactivationMaintenanceService(
    mongooseGuruInactivationMaintenanceRepository,
    axiosCurseducaMemberClient,
  ),
)

export const { cleanupInactivationList, diagnoseUsers } = handlers