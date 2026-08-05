import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { UserDashboardStatsService } from '../../services/users/userDashboardStats.service'

export function createUserDashboardStatsController(
  service: Pick<UserDashboardStatsService, 'get'>,
): RequestHandler {
  return async (_req, res, next) => {
    try {
      const stats = await service.get()
      res.json({ success: true, stats })
    } catch (error) {
      // SEC-10: replace the legacy local 500 with the central handler.
      next(new HttpError({
        status: 500,
        code: 'USER_DASHBOARD_STATS_FAILED',
        publicMessage: 'Erro ao buscar estatísticas.',
        cause: error,
      }))
    }
  }
}
