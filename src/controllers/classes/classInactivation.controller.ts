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

const MAX_CLASS_IDS = 100
const MAX_PAGE_LIMIT = 200
const MAX_OFFSET = 100_000
const ALLOWED_PLATFORMS = new Set(['hotmart', 'discord', 'curseduca', 'all'])
const ALLOWED_STATUSES = new Set(['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED'])

function positiveLimit(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_PAGE_LIMIT)
}

function safeOffset(value: unknown): number | null {
  if (value === undefined) return 0
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_OFFSET ? parsed : null
}

function validObjectId(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
}

export function createCreateInactivationListController(service: CreateService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { name, classIds, description, userId, platforms } = req.body ?? {}

      const validClassIds = Array.isArray(classIds)
        && classIds.length > 0
        && classIds.length <= MAX_CLASS_IDS
        && classIds.every((id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 200)
        && new Set(classIds).size === classIds.length
      const validPlatforms = platforms === undefined
        || (Array.isArray(platforms) && platforms.length > 0 && platforms.length <= 3 && platforms.every((platform) => typeof platform === 'string' && ALLOWED_PLATFORMS.has(platform)))
      if (!validClassIds || !validPlatforms) {
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
      const limitNum = positiveLimit(limit, 50)
      const offsetNum = safeOffset(offset)
      if (limitNum === null || offsetNum === null || (status !== undefined && !ALLOWED_STATUSES.has(String(status)))) {
        res.status(400).json({ success: false, message: 'Filtros de paginação ou status inválidos' })
        return
      }

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
      const { reason, userId } = req.body ?? {}

      if (!validObjectId(id)) {
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
      if (outcome === 'too_large') {
        res.status(413).json({ success: false, message: 'Lista excede o limite de reversão' })
        return
      }

      const { result } = outcome
      const message = result.listName ? `Lista revertida: ${result.reactivados} de ${result.totalNaLista} alunos reactivados` : 'Inativação revertida com sucesso'

      res.json(successResponse(
        { result: { success: true, ...result } },
        { message, timestamp: outcome.timestamp },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_INACTIVATION_REVERT_FAILED', publicMessage: 'Erro ao reverter inativação.', cause: error }))
    }
  }
}

export function createGetInactivationListStudentsController(service: StudentsService): RequestHandler {
  return async (req, res, next) => {
    try {
      const { id } = req.params
      const limit = positiveLimit(req.query.limit, 25)
      const offset = safeOffset(req.query.offset)
      const search = req.query.search === undefined ? undefined : String(req.query.search).trim()
      if (!validObjectId(id) || limit === null || offset === null || (search?.length ?? 0) > 200) {
        res.status(400).json({ success: false, message: 'ID ou paginação inválidos' })
        return
      }
      const outcome = await service.listStudents({ id: String(id), limit, offset, search })
      if (outcome === 'not_found') {
        res.status(404).json({ success: false, message: 'Lista não encontrada' })
        return
      }
      res.json(successResponse(
        { list: outcome.list, students: outcome.students },
        { pagination: { total: outcome.total, limit, offset }, timestamp: outcome.timestamp },
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
      if (!validObjectId(id)) {
        res.status(400).json({ success: false, message: 'ID da lista inválido' })
        return
      }
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
