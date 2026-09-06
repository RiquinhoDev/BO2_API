import type { NextFunction, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import type {
  GuruInactivationBulkInput,
  GuruInactivationSingleInput,
} from '../security/guruDestructiveInput'
import { HttpError, internalError } from '../security/errorHandling'
import { axiosCurseducaInactivationClient } from '../services/guru/curseducaInactivation.client'
import {
  createGuruExternalInactivationService,
  GuruExternalInactivationLimitError,
  type GuruExternalInactivationService,
} from '../services/guru/guruExternalInactivation.service'
import { mongooseGuruExternalInactivationRepository } from '../services/guru/mongooseGuruExternalInactivation.repository'
import { isCurseducaInactivationEnabled } from '../services/requestDrivenRuntimeConfig'

export const createGuruExternalInactivationHandlers = (
  service: GuruExternalInactivationService,
) => ({
  async inactivateSingle(
    input: GuruInactivationSingleInput,
    res: Response,
    next: NextFunction,
    requestId?: string,
  ) {
    if (!input.body.userProductId && !input.body.curseducaUserId) {
      return res.status(400).json({
        success: false,
        message: 'Deve fornecer userProductId ou curseducaUserId',
      })
    }
    try {
      const result = await service.inactivateSingle(input.body, requestId)
      if (result.kind === 'disabled') {
        return next(new HttpError({
          status: 503,
          code: 'GURU_INACTIVATION_DISABLED',
          publicMessage: 'Inativação CursEduca desativada',
        }))
      }
      if (result.kind === 'not-found') {
        return res.status(404).json({ success: false, message: 'UserProduct não encontrado' })
      }
      if (result.kind === 'missing-member') {
        return res.status(400).json({
          success: false,
          message: 'curseducaUserId não encontrado para este user',
        })
      }
      if (result.kind === 'in-progress') {
        return next(new HttpError({
          status: 409,
          code: 'GURU_INACTIVATION_IN_PROGRESS',
          publicMessage: 'Inativação CursEduca já está em processamento',
        }))
      }
      if (result.kind === 'indeterminate') {
        return next(new HttpError({
          status: 503,
          code: 'GURU_INACTIVATION_INDETERMINATE',
          publicMessage: 'Resultado da inativação CursEduca ficou indeterminado; requer reconciliação',
        }))
      }
      if (result.kind === 'request-id-reused') {
        return next(new HttpError({
          status: 409,
          code: 'GURU_INACTIVATION_REQUEST_ID_REUSED',
          publicMessage: 'X-Request-ID já foi usado noutro alvo',
        }))
      }
      if (result.kind === 'remote-failure') {
        return next(internalError(
          'Erro ao inativar no CursEduca',
          'GURU_INACTIVATION_SINGLE_REMOTE_FAILED',
          result.error,
        ))
      }
      if (result.kind === 'dry-run') {
        return res.json(successResponse({
          message: 'Plano de inativação gerado; nenhuma mutação executada',
          dryRun: true,
          planned: result.planned,
          alreadyInactive: result.alreadyInactive === true,
          memberId: result.memberId,
          email: result.email,
        }))
      }
      return res.json(successResponse({
        message: 'Membro inativado com sucesso',
        memberId: result.memberId,
        email: result.email,
        ...(result.alreadyInactive ? { alreadyInactive: true } : {}),
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
    requestId?: string,
  ) {
    if (input.body.all !== true && input.body.userProductIds === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Deve fornecer userProductIds ou all=true',
      })
    }
    try {
      const result = await service.inactivateBulk(input.body, requestId)
      if ('kind' in result) {
        if (result.kind === 'in-progress') {
          return next(new HttpError({
            status: 409,
            code: 'GURU_INACTIVATION_IN_PROGRESS',
            publicMessage: 'Inativação CursEduca já está em processamento',
          }))
        }
        if (result.kind === 'indeterminate') {
          return next(new HttpError({
            status: 503,
            code: 'GURU_INACTIVATION_INDETERMINATE',
            publicMessage: 'Resultado da inativação CursEduca ficou indeterminado; requer reconciliação',
          }))
        }
        return next(new HttpError({
          status: 409,
          code: 'GURU_INACTIVATION_REQUEST_ID_REUSED',
          publicMessage: 'X-Request-ID já foi usado noutro run',
        }))
      }
      if (result.disabled) {
        return next(new HttpError({
          status: 503,
          code: 'GURU_INACTIVATION_DISABLED',
          publicMessage: 'Inativação CursEduca desativada',
        }))
      }
      if (result.dryRun) {
        return res.json(successResponse({
          message: result.processed === 0
            ? 'Plano vazio; nenhuma mutação executada'
            : `Plano de ${result.processed} membros; nenhuma mutação executada`,
          ...result,
        }))
      }
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
      if (error instanceof GuruExternalInactivationLimitError) {
        return next(new HttpError({
          status: 413,
          code: 'GURU_INACTIVATION_LIMIT_EXCEEDED',
          publicMessage: `Inativação CursEduca limitada a ${error.limit} registos por execução`,
          cause: error,
        }))
      }
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
    { enabled: isCurseducaInactivationEnabled },
  ),
)

export const { inactivateBulk, inactivateSingle } = handlers
