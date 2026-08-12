import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import { internalError } from '../security/errorHandling'
import {
  createGuruInactivationMutationService,
  type GuruInactivationMutationService,
} from '../services/guru/guruInactivationMutation.service'
import { mongooseGuruInactivationMutationRepository } from '../services/guru/mongooseGuruInactivationMutation.repository'

export type { GuruInactivationMutationService }

const stringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string')

export const createGuruInactivationMutationHandlers = (
  service: GuruInactivationMutationService,
) => ({
  async quarantineUser(req: Request, res: Response, next: NextFunction) {
    const email = req.body?.email
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email é obrigatório' })
    }
    try {
      const result = await service.quarantine(email)
      if (result.kind === 'not-found') {
        return res.status(404).json({ success: false, message: 'Utilizador não encontrado' })
      }
      return res.json(successResponse({
        message: `${result.modifiedCount} produto(s) de ${email} movidos para QUARENTENA`,
        modifiedCount: result.modifiedCount,
      }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao mover produtos para quarentena',
        'GURU_INACTIVATION_QUARANTINE_FAILED',
        error,
      ))
    }
  },

  async revertInactivationMark(req: Request, res: Response, next: NextFunction) {
    const userProductId = req.body?.userProductId
    if (typeof userProductId !== 'string' || !userProductId) {
      return res.status(400).json({ success: false, message: 'Deve fornecer userProductId' })
    }
    try {
      const result = await service.revert(userProductId)
      if (result.kind === 'not-found') {
        return res.status(404).json({ success: false, message: 'UserProduct não encontrado' })
      }
      return res.json(successResponse({ message: 'Marcação revertida com sucesso' }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao reverter marcação de inativação',
        'GURU_INACTIVATION_REVERT_FAILED',
        error,
      ))
    }
  },

  async cleanupDuplicateUserProducts(req: Request, res: Response, next: NextFunction) {
    const userProductIds = req.body?.userProductIds
    if (!stringArray(userProductIds)) {
      return res.status(400).json({
        success: false,
        message: 'Campo "userProductIds" obrigatório (array de strings)',
      })
    }
    try {
      const result = await service.cleanupDuplicates(
        userProductIds,
        req.body?.setIsPrimary === true,
      )
      const message = result.mode === 'primary'
        ? `${result.modifiedCount} UserProduct(s) marcados como isPrimary:true`
        : `${result.modifiedCount} UserProduct(s) marcados como INACTIVE (BD apenas, CursEduca não foi tocado)`
      return res.json(successResponse({
        message,
        modifiedCount: result.modifiedCount,
        requestedCount: result.requestedCount,
      }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao limpar produtos duplicados',
        'GURU_INACTIVATION_DUPLICATE_CLEANUP_FAILED',
        error,
      ))
    }
  },

  async markStaleInactive(req: Request, res: Response, next: NextFunction) {
    const emails = req.body?.emails
    if (!stringArray(emails)) {
      return res.status(400).json({
        success: false,
        message: 'Campo "emails" obrigatório (array de strings)',
      })
    }
    try {
      const result = await service.markStale(emails)
      if (result.usersFound === 0) {
        return res.json(successResponse({ message: 'Nenhum user encontrado', modifiedCount: 0 }))
      }
      return res.json(successResponse({
        message: `${result.userProductsModified} UserProduct(s) e ${result.usersModified} User.curseduca marcados INACTIVE (BD apenas, CursEduca não foi tocado)`,
        ...result,
      }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao marcar produtos sem acesso como inativos',
        'GURU_INACTIVATION_MARK_STALE_FAILED',
        error,
      ))
    }
  },

  async restoreUserProducts(req: Request, res: Response, next: NextFunction) {
    const userProductIds = req.body?.userProductIds
    if (!stringArray(userProductIds)) {
      return res.status(400).json({
        success: false,
        message: 'Campo "userProductIds" obrigatório (array de strings)',
      })
    }
    try {
      const result = await service.restore(userProductIds)
      return res.json(successResponse({
        message: `${result.modifiedCount} UserProduct(s) restaurados para PARA_INATIVAR com isPrimary:true`,
        ...result,
      }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao restaurar produtos',
        'GURU_INACTIVATION_RESTORE_FAILED',
        error,
      ))
    }
  },

  async fixUsersToActive(req: Request, res: Response, next: NextFunction) {
    const emails = req.body?.emails
    if (!stringArray(emails)) {
      return res.status(400).json({
        success: false,
        message: 'Campo "emails" obrigatório (array de strings)',
      })
    }
    try {
      const result = await service.fixActive(emails)
      return res.json(successResponse({
        message: `${result.updatedUsers} utilizador(es) corrigido(s) para ACTIVE`,
        ...result,
      }))
    } catch (error: unknown) {
      return next(internalError(
        'Erro ao corrigir utilizadores para ativos',
        'GURU_INACTIVATION_FIX_ACTIVE_FAILED',
        error,
      ))
    }
  },
})

const handlers = createGuruInactivationMutationHandlers(
  createGuruInactivationMutationService(mongooseGuruInactivationMutationRepository),
)

export const {
  cleanupDuplicateUserProducts,
  fixUsersToActive,
  markStaleInactive,
  quarantineUser,
  restoreUserProducts,
  revertInactivationMark,
} = handlers
