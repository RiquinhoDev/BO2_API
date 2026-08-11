import { successResponse } from '../../contracts/responseContract'
import { classAnalyticsClassInput } from '../../security/classAnalyticsInput'
import { HttpError } from '../../security/errorHandling'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { ClassOpportunitiesService } from '../../services/analytics/classOpportunities.service'

type OpportunitiesService = Pick<ClassOpportunitiesService, 'getForClass'>

export function createClassOpportunitiesController(
  service: OpportunitiesService,
): ValidatedInputHandler<typeof classAnalyticsClassInput> {
  return async (input, _req, res, next) => {
    try {
      const result = await service.getForClass(input.params.classId)

      if (!result.found) {
        res.status(404).json({
          success: false,
          message: 'Turma não encontrada',
        })
        return
      }

      res.status(200).json(successResponse(result.data, {
        timestamp: new Date(result.timestamp).toISOString(),
      }))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'CLASS_OPPORTUNITIES_READ_FAILED',
        publicMessage: 'Erro ao analisar oportunidades de melhoria',
        cause: error,
      }))
    }
  }
}
