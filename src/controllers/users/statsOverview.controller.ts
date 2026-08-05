import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { StatsOverviewService } from '../../services/users/statsOverview.service'

export function createStatsOverviewController(
  service: Pick<StatsOverviewService, 'get'>,
): RequestHandler {
  return async (_req, res, next) => {
    try {
      const data = await service.get()

      // Success shape preserved verbatim for the Front.
      res.json({ success: true, data, _v2Enabled: true })
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
