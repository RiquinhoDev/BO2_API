import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import { globalAnalyticsInput } from '../../security/globalAnalyticsInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { GlobalAnalyticsService } from '../../services/analytics/globalAnalytics.service'

type GlobalService = Pick<GlobalAnalyticsService, 'get'>

export function createGlobalAnalyticsController(
  service: GlobalService,
): ValidatedInputHandler<typeof globalAnalyticsInput> {
  return async (_input, _req, res, next) => {
    try {
      const result = await service.get()

      if (result.cached) {
        const { calculationDuration, lastUpdated, ...data } = result.data
        res.status(200).json(successResponse(data, {
          cached: true,
          timestamp: new Date(result.timestamp).toISOString(),
          cacheAge: result.cacheAge,
          calculationDuration,
          lastUpdated,
        }))
        return
      }

      if (result.empty) {
        const { message, ...data } = result.data
        res.status(200).json(successResponse(data, { message }))
        return
      }

      const { calculationDuration, lastUpdated, ...data } = result.data
      res.status(200).json(successResponse(data, {
        cached: false,
        timestamp: new Date(result.timestamp).toISOString(),
        calculationDuration,
        lastUpdated,
      }))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'GLOBAL_ANALYTICS_READ_FAILED',
        publicMessage: 'Erro ao calcular analytics globais',
        cause: error,
      }))
    }
  }
}
