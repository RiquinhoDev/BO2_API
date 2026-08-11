import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import { multiPlatformAnalyticsInput } from '../../security/multiPlatformAnalyticsInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { MultiPlatformAnalyticsService } from '../../services/analytics/multiPlatformAnalytics.service'

type MultiPlatformService = Pick<MultiPlatformAnalyticsService, 'get'>

export function createMultiPlatformAnalyticsController(
  service: MultiPlatformService,
): ValidatedInputHandler<typeof multiPlatformAnalyticsInput> {
  return async (_input, _req, res, next) => {
    try {
      const result = await service.get()
      res.status(200).json(successResponse(result))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'ANALYTICS_MULTI_PLATFORM_FAILED',
        publicMessage: 'Erro ao buscar analytics',
        cause: error,
      }))
    }
  }
}
