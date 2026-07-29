import { classComparisonInput } from '../../security/classComparisonInput'
import { HttpError } from '../../security/errorHandling'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { ClassComparisonService } from '../../services/analytics/classComparison.service'

type ComparisonService = Pick<ClassComparisonService, 'compare'>

export function createClassComparisonController(
  service: ComparisonService,
): ValidatedInputHandler<typeof classComparisonInput> {
  return async (input, _req, res, next) => {
    try {
      const result = await service.compare(input.query.classIds)

      if (!result.found) {
        res.status(404).json({
          success: false,
          message: 'Nenhuma turma válida encontrada para comparação',
        })
        return
      }

      if (result.data.cached) {
        res.status(200).json({
          success: true,
          data: result.data,
          cached: true,
          timestamp: new Date(result.timestamp).toISOString(),
          cacheAge: result.cacheAge,
        })
        return
      }

      res.status(200).json({
        success: true,
        data: result.data,
        cached: false,
        timestamp: new Date(result.timestamp).toISOString(),
        calculationDuration: result.data.calculationDuration,
      })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'CLASS_COMPARISON_READ_FAILED',
        publicMessage: 'Erro ao comparar turmas',
        cause: error,
      }))
    }
  }
}
