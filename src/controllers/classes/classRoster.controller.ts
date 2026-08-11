import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import {
  sanitizeLimit,
  sanitizeOffset,
  sanitizeSortBy,
  type ClassRosterService,
} from '../../services/classes/classRoster.service'

type Service = Pick<ClassRosterService, 'getStudents' | 'search'>

const num = (value: unknown, fallback: number): number => Number(value ?? fallback)

export function createGetStudentsByClassController(service: Service): RequestHandler<{ classId: string }> {
  return async (req, res, next) => {
    try {
      const { classId } = req.params
      const includeInactive = (req.query.includeInactive ?? 'false') === 'true'
      const limit = sanitizeLimit(num(req.query.limit, 100), 100)
      const offset = sanitizeOffset(num(req.query.offset, 0))
      const sortBy = sanitizeSortBy((req.query.sortBy ?? 'name') as string)
      const sortOrder = (req.query.sortOrder ?? 'asc') as string

      const result = await service.getStudents(classId, { includeInactive, limit, offset, sortBy, sortOrder })

      if (result.kind === 'bad_request') {
        res.status(400).json({ success: false, message: 'classId é obrigatório' })
        return
      }
      if (result.kind === 'not_found') {
        res.status(404).json({ success: false, message: 'Turma não encontrada' })
        return
      }

      res.json(successResponse(
        { classId, className: result.className, students: result.students },
        { pagination: { total: result.total, limit, offset, hasMore: (offset + result.students.length) < result.total }, filters: { includeInactive, sortBy, sortOrder }, timestamp: result.timestamp },
      ))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_ROSTER_FAILED', publicMessage: 'Erro ao buscar estudantes da turma.', cause: error }))
    }
  }
}

export function createSearchStudentsController(service: Service): RequestHandler {
  return async (req, res, next) => {
    try {
      const { email, name, discordId, classId, status } = req.query
      const result = await service.search({
        email: email as string,
        name: name as string,
        discordId: discordId as string,
        classId: classId as string,
        status: status as string,
        limit: sanitizeLimit(num(req.query.limit, 50), 50),
        offset: sanitizeOffset(num(req.query.offset, 0)),
      })

      if (result.kind === 'no_criteria') {
        res.status(400).json({ success: false, message: 'Pelo menos um critério de pesquisa é obrigatório' })
        return
      }
      if (result.kind === 'not_found') {
        res.status(404).json({ success: false, message: 'Nenhum estudante encontrado com os critérios fornecidos' })
        return
      }

      const multiple = result.students.length > 1
      const spread = multiple ? { students: result.students, total: result.total } : result.students[0]

      res.json({
        success: true,
        multiple,
        message: multiple ? `Encontrados ${result.students.length} estudantes` : 'Estudante encontrado',
        ...spread,
        timestamp: result.timestamp,
      })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_STUDENT_SEARCH_FAILED', publicMessage: 'Erro ao pesquisar estudantes.', cause: error }))
    }
  }
}
