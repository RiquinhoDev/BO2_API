import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { UserPlatformStatsService } from '../../services/users/userPlatformStats.service'

export function createUserPlatformStatsController(
  service: Pick<UserPlatformStatsService, 'get'>,
): RequestHandler {
  return async (_req, res, next) => {
    try {
      const stats = await service.get()
      res.json(successResponse(stats))
    } catch (error) {
      // SEC-10: replace the legacy local 500 (which leaked via `details`) with
      // the central handler and a stable code.
      next(new HttpError({
        status: 500,
        code: 'USER_STATS_FAILED',
        publicMessage: 'Erro ao obter estatísticas.',
        cause: error,
      }))
    }
  }
}
