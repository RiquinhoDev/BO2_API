import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { ClassInput, ClassMutationsService } from '../../services/classes/classMutations.service'

type UpsertService = Pick<ClassMutationsService, 'upsert'>
type RemoveService = Pick<ClassMutationsService, 'remove'>

export interface DeleteClassInput {
  params: { classId: string }
}

export function createAddOrEditClassController(service: UpsertService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { classId, name, description, isActive = true, estado, source = 'manual' } = req.body

      if (!classId || !name) {
        res.status(400).json({ success: false, message: 'classId e name são obrigatórios' })
        return
      }

      // Estado has priority over the isActive boolean; keep both consistent.
      let finalEstado = estado
      let finalIsActive = isActive
      if (estado) {
        finalIsActive = estado === 'ativo'
      } else {
        finalEstado = isActive ? 'ativo' : 'inativo'
      }

      const input: ClassInput = {
        classId: classId.trim(),
        name: name.trim(),
        description: description?.trim(),
        isActive: finalIsActive,
        estado: finalEstado,
        source,
      }

      const result = await service.upsert(input)

      res.json({
        success: true,
        message: result.isNew ? 'Turma criada com sucesso' : 'Turma atualizada com sucesso',
        class: result.class,
        isNew: result.isNew,
        timestamp: result.timestamp,
      })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_UPSERT_FAILED', publicMessage: 'Erro ao processar turma.', cause: error }))
    }
  }
}

export function createDeleteClassController(service: RemoveService) {
  return async (input: DeleteClassInput, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await service.remove(input.params.classId)

      if (result.kind === 'not_found') {
        res.status(404).json({ success: false, message: 'Turma não encontrada' })
        return
      }

      if (result.kind === 'has_students') {
        res.status(400).json({
          success: false,
          message: `Não é possível remover turma com ${result.studentCount} estudante(s). Mova os estudantes primeiro.`,
        })
        return
      }

      res.json({ success: true, message: 'Turma removida com sucesso', timestamp: result.timestamp })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_DELETE_FAILED', publicMessage: 'Erro ao remover turma.', cause: error }))
    }
  }
}
