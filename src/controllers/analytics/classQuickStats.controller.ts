import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import { classQuickStatsInput } from '../../security/classQuickStatsInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { ClassQuickStatsService } from '../../services/analytics/classQuickStats.service'

type QuickStatsService = Pick<ClassQuickStatsService, 'get'>

export function createClassQuickStatsController(
  service: QuickStatsService,
  now: () => Date = () => new Date(),
): ValidatedInputHandler<typeof classQuickStatsInput> {
  return async (input, _req, res, next) => {
    try {
      const result = await service.get(input.params.classId)

      if ('message' in result) {
        res.status(200).json(successResponse(result))
        return
      }

      res.status(200).json(successResponse(
        result,
        { timestamp: now().toISOString() },
      ))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'CLASS_QUICK_STATS_READ_FAILED',
        publicMessage: 'Erro ao buscar estatísticas rápidas',
        cause: error,
      }))
    }
  }
}
