import { HttpError } from '../../security/errorHandling'
import { benchmarkAnalyticsInput } from '../../security/benchmarkAnalyticsInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { BenchmarkAnalyticsService } from '../../services/analytics/benchmarkAnalytics.service'

type BenchmarkService = Pick<BenchmarkAnalyticsService, 'get'>

export function createBenchmarkAnalyticsController(
  service: BenchmarkService,
): ValidatedInputHandler<typeof benchmarkAnalyticsInput> {
  return async (_input, _req, res, next) => {
    try {
      const result = await service.get()
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
        timestamp: new Date(result.timestamp).toISOString(),
      })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'ANALYTICS_BENCHMARKS_READ_FAILED',
        publicMessage: 'Erro ao calcular benchmarks da indústria',
        cause: error,
      }))
    }
  }
}
