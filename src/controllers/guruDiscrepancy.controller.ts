import type { NextFunction, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import type { GuruMarkDiscrepanciesInput } from '../security/guruDestructiveInput'
import { internalError } from '../security/errorHandling'
import { curseducaIdentityLookup } from '../services/guru/curseducaIdentityLookup.client'
import { guruActiveSubscriptionLookup } from '../services/guru/guruActiveSubscription.client'
import {
  CurseducaProductUnavailableError,
  createGuruDiscrepancyService,
  type GuruDiscrepancyService,
} from '../services/guru/guruDiscrepancy.service'
import { mongooseGuruDiscrepancyRepository } from '../services/guru/mongooseGuruDiscrepancy.repository'

export const createGuruDiscrepancyHandlers = (
  service: GuruDiscrepancyService,
) => ({
  async markDiscrepanciesForInactivation(
    input: GuruMarkDiscrepanciesInput,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const result = await service.mark(input.body.emails)
      return res.json(successResponse({
        message: `${result.marked + result.created} UserProduct(s) marcado(s) para inativação (${result.marked} marcados, ${result.created} criados)`,
        ...result,
        total: result.marked + result.created,
        details: result.details.slice(0, 50),
      }))
    } catch (error: unknown) {
      const publicMessage = error instanceof CurseducaProductUnavailableError
        ? error.message
        : 'Erro ao marcar discrepâncias'
      return next(internalError(
        publicMessage,
        'GURU_MARK_DISCREPANCIES_FAILED',
        error,
      ))
    }
  },
})

const handlers = createGuruDiscrepancyHandlers(
  createGuruDiscrepancyService(
    mongooseGuruDiscrepancyRepository,
    curseducaIdentityLookup,
    guruActiveSubscriptionLookup,
  ),
)

export const { markDiscrepanciesForInactivation } = handlers