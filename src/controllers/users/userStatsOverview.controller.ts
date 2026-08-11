import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { UserStatsOverviewService } from '../../services/users/userStatsOverview.service'

export function createUserStatsOverviewController(
  service: Pick<UserStatsOverviewService, 'get'>,
): RequestHandler {
  return async (_req, res, next) => {
    try {
      const data = await service.get()

      res.json(successResponse(data))
    } catch (error) {
      // SEC-10: the legacy handler answered 500 with error.message in the body;
      // route the failure through the central handler with a stable public
      // message and a structured code instead.
      next(new HttpError({
        status: 500,
        code: 'USER_STATS_OVERVIEW_FAILED',
        publicMessage: 'Erro ao calcular estatísticas de utilizadores.',
        cause: error,
      }))
    }
  }
}
