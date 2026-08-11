import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { UserProductStatsService } from '../../services/users/userProductStats.service'

export function createUserProductStatsController(
  service: Pick<UserProductStatsService, 'get'>,
): RequestHandler {
  return async (_req, res, next) => {
    try {
      const stats = await service.get()
      res.status(200).json(successResponse(stats, { timestamp: new Date().toISOString() }))
    } catch (error) {
      // SEC-10: replace the legacy local 500 with the central handler.
      next(new HttpError({
        status: 500,
        code: 'PRODUCT_MEMBERSHIP_STATS_FAILED',
        publicMessage: 'Erro ao calcular estatísticas de produtos.',
        cause: error,
      }))
    }
  }
}
