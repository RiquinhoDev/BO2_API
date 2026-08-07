import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { StudentMovementService } from '../../services/classes/studentMovement.service'

type MoveOneService = Pick<StudentMovementService, 'moveOne'>
type MoveManyService = Pick<StudentMovementService, 'moveMany'>

export function createMoveStudentController(service: MoveOneService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { studentId, fromClassId, toClassId, reason } = req.body

      if (!studentId || !toClassId) {
        res.status(400).json({ success: false, message: 'studentId e toClassId são obrigatórios' })
        return
      }

      const { movement, timestamp } = await service.moveOne({
        studentId,
        fromClassId,
        toClassId,
        reason: reason || 'Movimentação via API',
      })

      res.json({ success: true, message: 'Estudante movido com sucesso', movement, timestamp })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'STUDENT_MOVE_FAILED', publicMessage: 'Erro ao mover estudante.', cause: error }))
    }
  }
}

export function createMoveMultipleStudentsController(service: MoveManyService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { studentIds, toClassId, reason } = req.body

      if (!studentIds || !Array.isArray(studentIds) || !toClassId) {
        res.status(400).json({ success: false, message: 'studentIds (array) e toClassId são obrigatórios' })
        return
      }

      const { results, timestamp } = await service.moveMany({
        studentIds,
        toClassId,
        reason: reason || 'Movimentação múltipla via API',
      })

      res.json({
        success: true,
        message: `Movimentação concluída: ${results.success.length} sucessos, ${results.errors.length} erros`,
        results,
        timestamp,
      })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'STUDENT_MOVE_MULTIPLE_FAILED', publicMessage: 'Erro ao mover estudantes.', cause: error }))
    }
  }
}
