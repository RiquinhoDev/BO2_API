import type { NextFunction, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import type {
  GuruInactivationBulkInput,
  GuruInactivationSingleInput,
} from '../security/guruDestructiveInput'
import { internalError } from '../security/errorHandling'
import { axiosCurseducaInactivationClient } from '../services/guru/curseducaInactivation.client'
import {
  createGuruExternalInactivationService,
  type GuruExternalInactivationService,
} from '../services/guru/guruExternalInactivation.service'
import { mongooseGuruExternalInactivationRepository } from '../services/guru/mongooseGuruExternalInactivation.repository'

export const createGuruExternalInactivationHandlers = (
  service: GuruExternalInactivationService,
) => ({
  async inactivateSingle(
    input: GuruInactivationSingleInput,
    res: Response,
    next: NextFunction,
  ) {
    if (!input.body.userProductId && !input.body.curseducaUserId) {
      return res.status(400).json({
        success: false,
        message: 'Deve fornecer userProductId ou curseducaUserId',
      })
    }
    try {
      const result = await service.inactivateSingle(input.body)
      if (result.kind === 'not-found') {
        return res.status(404).json({ success: false, message: 'UserProduct não encontrado' })
      }
      if (result.kind === 'missing-member') {
        return res.status(400).json({
          success: false,
          message: 'curseducaUserId não encontrado para este user',
        })
      }
      if (result.kind === 'remote-failure') {
        return next(internalError(
          'Erro ao inativar no CursEduca',
          'GURU_INACTIVATION_SINGLE_REMOTE_FAILED',
          result.error,
        ))
      }
      return res.json(successResponse({
        message: 'Membro inativado com sucesso',
        memberId: result.memberId,
        email: result.email,
      }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao inativar membro no CursEduca',
        'GURU_INACTIVATION_SINGLE_FAILED',
        error,
      ))
    }
  },

  async inactivateBulk(
    input: GuruInactivationBulkInput,
    res: Response,
    next: NextFunction,
  ) {
    if (input.body.all !== true && input.body.userProductIds === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Deve fornecer userProductIds ou all=true',
      })
    }
    try {
      const result = await service.inactivateBulk(input.body)
      if (result.processed === 0) {
        return res.json(successResponse({
          message: 'Nenhum user para inativar',
          processed: 0,
          succeeded: 0,
          failed: 0,
        }))
      }
      return res.json(successResponse({
        message: `Processados ${result.processed} membros`,
        ...result,
      }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao inativar membros no CursEduca',
        'GURU_INACTIVATION_BULK_FAILED',
        error,
      ))
    }
  },
})

const handlers = createGuruExternalInactivationHandlers(
  createGuruExternalInactivationService(
    mongooseGuruExternalInactivationRepository,
    axiosCurseducaInactivationClient,
  ),
)

export const { inactivateBulk, inactivateSingle } = handlers