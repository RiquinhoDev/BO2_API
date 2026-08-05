import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import { DEFAULT_HISTORY_LIMIT } from '../../services/users/studentHistory.service'
import type { StudentHistoryService } from '../../services/users/studentHistory.service'

type StudentHistoryParams = { id: string }

export function createStudentHistoryController(
  service: Pick<StudentHistoryService, 'get'>,
): RequestHandler<StudentHistoryParams> {
  return async (req, res, next) => {
    try {
      // `parseInt` on absent or unparsable input yields NaN, which the legacy
      // handler folded to the default through `||`.
      const limit = parseInt(String(req.query.limit), 10) || DEFAULT_HISTORY_LIMIT
      const result = await service.get(req.params.id, limit)

      if (!result) {
        res.status(404).json({ message: 'Aluno não encontrado.' })
        return
      }

      res.status(200).json(result)
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'STUDENT_HISTORY_FAILED',
        publicMessage: 'Erro ao buscar histórico do aluno.',
        cause: error,
      }))
    }
  }
}
