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
        res.status(200).json({
          success: true,
          data: result.data,
          cached: true,
          timestamp: new Date(result.timestamp).toISOString(),
          cacheAge: result.cacheAge,
        })
        return
      }

      if (result.empty) {
        res.status(200).json({
          success: true,
          data: result.data,
        })
        return
      }

      res.status(200).json({
        success: true,
        data: result.data,
        cached: false,
        timestamp: new Date(result.timestamp).toISOString(),
        calculationDuration: result.calculationDuration,
      })
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
