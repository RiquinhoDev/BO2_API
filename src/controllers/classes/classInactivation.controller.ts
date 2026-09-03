import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { ClassInactivationService } from '../../services/classes/classInactivation.service'

type CreateService = Pick<ClassInactivationService, 'createList'>
type ListService = Pick<ClassInactivationService, 'listInactivations'>
type RevertService = Pick<ClassInactivationService, 'revert'>
type StudentsService = Pick<ClassInactivationService, 'listStudents'>
type DeleteService = Pick<ClassInactivationService, 'deleteList'>
type StatusService = Pick<ClassInactivationService, 'updateStatus'>

export function createCreateInactivationListController(service: CreateService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { name, classIds, description, userId, platforms } = req.body

      if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
        res.status(400).json({ success: false, message: 'classIds (array) é obrigatório' })
        return
      }

      const result = await service.createList({ name, classIds, description, userId, platforms })

      res.json(successResponse(
        { list: result.list, classUpdates: result.classUpdates },
        { message: 'Lista de inativação criada e turmas atualizadas', timestamp: result.timestamp },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_INACTIVATION_CREATE_FAILED', publicMessage: 'Erro ao criar lista de inativação.', cause: error }))
    }
  }
}

export function createGetInactivationListsController(service: ListService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query
      const limitNum = Number(limit)
      const offsetNum = Number(offset)

      const result = await service.listInactivations({ status, limit: limitNum, offset: offsetNum })

      res.json(successResponse(
        { lists: result.lists },
        { total: result.total, filters: { status, limit: limitNum, offset: offsetNum }, timestamp: result.timestamp },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_INACTIVATION_LIST_FAILED', publicMessage: 'Erro ao buscar listas de inativação.', cause: error }))
    }
  }
}

export function createRevertInactivationController(service: RevertService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { id } = req.params
      const { reason, userId } = req.body

      if (!id) {
        res.status(400).json({ success: false, message: 'ID da lista de inativação é obrigatório' })
        return
      }

      const outcome = await service.revert(String(id), { reason, userId })
      if (outcome === 'not_found') {
        res.status(404).json({ success: false, message: 'Lista ou registo de inativação não encontrado' })
        return
      }
      if (outcome === 'already_reversed') {
        res.status(400).json({ success: false, message: 'Esta lista já tinha sido revertida' })
        return
      }

      const { result } = outcome
      const message = result.listName
        ? `Lista revertida: ${result.reactivados} de ${result.totalNaLista} alunos reactivados`
        : 'Inativação revertida com sucesso'

      res.json(successResponse(
        { result: { success: true, ...result } },
        { message, timestamp: outcome.timestamp },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_INACTIVATION_REVERT_FAILED', publicMessage: 'Erro ao reverter inativação.', cause: error }))
    }
  }
}

export function createUpdateClassStatusController(service: StatusService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { classId, isActive, reason, userId } = req.body

      if (!classId || typeof isActive !== 'boolean') {
        res.status(400).json({ success: false, message: 'classId e isActive (boolean) são obrigatórios' })
        return
      }

      const outcome = await service.updateStatus(classId, isActive, { reason, userId })
      if (outcome === 'not_found') {
        res.status(404).json({ success: false, message: 'Turma não encontrada' })
        return
      }

      res.json(successResponse(
        { class: outcome.class, studentsAffected: isActive ? outcome.reactivatedStudents : outcome.affectedStudents, action: outcome.action },
        { message: outcome.message, timestamp: outcome.timestamp },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_UPDATE_STATUS_FAILED', publicMessage: 'Erro ao atualizar status da turma.', cause: error }))
    }
  }
}

export function createGetInactivationListStudentsController(service: StudentsService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { id } = req.params
      const { limit = 25, offset = 0, search } = req.query

      // Tecto de 200: o array de alunos vive dentro do documento da lista e há
      // listas com mais de 1600 entradas.
      const outcome = await service.listStudents({
        id: String(id),
        limit: Math.min(Number(limit) || 25, 200),
        offset: Number(offset) || 0,
        search: search === undefined ? undefined : String(search),
      })

      if (outcome === 'not_found') {
        res.status(404).json({ success: false, message: 'Lista não encontrada' })
        return
      }

      res.json(successResponse(
        { list: outcome.list, students: outcome.students },
        {
          pagination: { total: outcome.total, limit: Math.min(Number(limit) || 25, 200), offset: Number(offset) || 0 },
          timestamp: outcome.timestamp,
        },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_INACTIVATION_STUDENTS_FAILED', publicMessage: 'Erro ao buscar alunos da lista.', cause: error }))
    }
  }
}

export function createDeleteInactivationListController(service: DeleteService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { id } = req.params
      const outcome = await service.deleteList(String(id))

      if (outcome === 'not_found') {
        res.status(404).json({ success: false, message: 'Lista não encontrada' })
        return
      }

      res.json(successResponse(
        { removed: outcome.removed },
        { message: 'Registo removido do histórico. Nenhum aluno foi alterado.', timestamp: outcome.timestamp },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_INACTIVATION_DELETE_FAILED', publicMessage: 'Erro ao apagar lista de inativação.', cause: error }))
    }
  }
}
