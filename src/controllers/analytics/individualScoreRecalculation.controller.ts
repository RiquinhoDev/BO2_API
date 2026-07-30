import { HttpError } from '../../security/errorHandling'
import { individualScoreRecalculationInput } from '../../security/individualScoreRecalculationInput'
import type { ValidatedInputHandler } from '../../security/validatedInput'
import type { IndividualScoreRecalculationService } from '../../services/analytics/individualScoreRecalculation.service'

type RecalculationService = Pick<
  IndividualScoreRecalculationService,
  'recalculate'
>

export function createIndividualScoreRecalculationController(
  service: RecalculationService,
): ValidatedInputHandler<typeof individualScoreRecalculationInput> {
  return async ({ params }, _req, res, next) => {
    try {
      const result = await service.recalculate(params.classId)
      if (result.kind === 'not-found') {
        res.status(404).json({
          success: false,
          message: 'Nenhum aluno encontrado na turma',
        })
        return
      }

      res.status(200).json({
        success: true,
        message:
          `Scores recalculados para ${result.successfulUpdates}`
          + ` de ${result.totalStudents} alunos`,
        data: {
          classId: result.classId,
          totalStudents: result.totalStudents,
          successfulUpdates: result.successfulUpdates,
          failedUpdates: result.failedUpdates,
          calculationDuration: result.calculationDuration,
          results: result.results,
        },
        timestamp: result.completedAt.toISOString(),
      })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'ANALYTICS_SCORE_RECALCULATION_FAILED',
        publicMessage: 'Erro ao recalcular scores individuais da turma',
        cause: error,
      }))
    }
  }
}
