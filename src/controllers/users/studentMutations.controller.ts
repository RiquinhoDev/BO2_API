import type { NextFunction, Response, RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { UsersDeleteStudentInput } from '../../security/usersDestructiveInput'
import type { StudentMutationsService } from '../../services/users/studentMutations.service'
import { successResponse } from '../../contracts/responseContract'

export type DeleteStudentHandler = (
  input: UsersDeleteStudentInput,
  res: Response,
  next: NextFunction,
) => Promise<void>

type Service = Pick<StudentMutationsService, 'edit' | 'sync' | 'remove'>

export function createEditStudentController(service: Service): RequestHandler<{ id: string }> {
  return async (req, res, next) => {
    try {
      const result = await service.edit(req.params.id, req.body ?? {})
      if (result.kind === 'not_found') {
        res.status(404).json({ message: 'Aluno não encontrado' })
        return
      }
      if (result.kind === 'invalid_email') {
        res.status(400).json({ message: 'Email inválido' })
        return
      }
      res.status(200).json(successResponse(result.student))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'EDIT_STUDENT_FAILED',
        publicMessage: 'Erro ao atualizar aluno.',
        cause: error,
      }))
    }
  }
}

export function createSyncStudentController(service: Service): RequestHandler<{ id: string }> {
  return async (req, res, next) => {
    try {
      const result = await service.sync(req.params.id)
      if (result.kind === 'not_found') {
        res.status(404).json({ message: 'Aluno não encontrado.' })
        return
      }
      res.status(200).json(successResponse({
        message: 'Sincronização específica iniciada para o aluno.',
        email: result.email,
      }))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'SYNC_STUDENT_FAILED',
        publicMessage: 'Erro ao sincronizar aluno.',
        cause: error,
      }))
    }
  }
}

export function createDeleteStudentController(service: Service): DeleteStudentHandler {
  return async (input, res, next) => {
    try {
      const result = await service.remove(input.params.id, input.query.permanent)
      if (result.kind === 'not_found') {
        res.status(404).json({ message: 'Aluno não encontrado' })
        return
      }
      if (result.kind === 'deleted') {
        res.status(200).json(successResponse({ message: 'Aluno eliminado permanentemente' }))
        return
      }
      res.status(200).json(successResponse({ message: 'Aluno marcado como inativo', student: result.student }))
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'DELETE_STUDENT_FAILED',
        publicMessage: 'Erro ao eliminar aluno.',
        cause: error,
      }))
    }
  }
}
