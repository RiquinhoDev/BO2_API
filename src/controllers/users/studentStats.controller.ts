import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { StudentStatsService } from '../../services/users/studentStats.service'

type StudentStatsParams = { id: string }

export function createStudentStatsController(
  service: Pick<StudentStatsService, 'get'>,
): RequestHandler<StudentStatsParams> {
  return async (req, res, next) => {
    try {
      const stats = await service.get(req.params.id)

      if (!stats) {
        res.status(404).json({ message: 'Aluno não encontrado.' })
        return
      }

      res.status(200).json(successResponse(stats))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'STUDENT_STATS_FAILED',
        publicMessage: 'Erro ao calcular estatísticas do aluno.',
        cause: error,
      }))
    }
  }
}
