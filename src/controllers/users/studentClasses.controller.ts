import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { StudentClassesService } from '../../services/users/studentClasses.service'

type StudentClassesParams = { userId?: string }

export function createStudentClassesController(
  service: Pick<StudentClassesService, 'get'>,
): RequestHandler<StudentClassesParams> {
  return async (req, res, next) => {
    try {
      const { userId } = req.params

      // Unreachable through the mounted route, kept as an explicit guard.
      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'ID de utilizador é obrigatório',
        })
        return
      }

      const result = await service.get(userId)

      if (!result) {
        res.status(404).json({
          success: false,
          message: 'Utilizador não encontrado',
        })
        return
      }

      res.status(200).json({ success: true, data: result })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USER_CLASSES_FAILED',
        publicMessage: 'Erro ao buscar turmas do utilizador',
        cause: error,
      }))
    }
  }
}
