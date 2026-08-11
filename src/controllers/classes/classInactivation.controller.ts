import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { ClassInactivationService } from '../../services/classes/classInactivation.service'

type CreateService = Pick<ClassInactivationService, 'createList'>
type ListService = Pick<ClassInactivationService, 'listInactivations'>
type RevertService = Pick<ClassInactivationService, 'revert'>
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
        res.status(404).json({ success: false, message: 'Registro de inativação não encontrado' })
        return
      }

      res.json(successResponse(
        { result: { success: true } },
        { message: 'Inativação revertida com sucesso', timestamp: outcome.timestamp },
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
