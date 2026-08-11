import type { Request, RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { ClassDetailsService } from '../../services/classes/classDetails.service'

type Service = Pick<ClassDetailsService, 'stats' | 'details' | 'fetch'>

interface FetchedStudent {
  name?: string
  email?: string
  discordIds?: string[]
  discord?: { discordIds?: string[] }
}

export function createGetClassStatsController(service: Service): RequestHandler {
  return async (req, res, next) => {
    try {
      const { dateFrom, dateTo, classIds } = req.query
      const result = await service.stats({
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        classIds: classIds ? (classIds as string).split(',') : undefined,
      })
      res.json(successResponse(result.data, { timestamp: result.timestamp }))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_STATS_FAILED', publicMessage: 'Erro ao buscar estatísticas.', cause: error }))
    }
  }
}

export function createGetClassDetailsController(service: Service): RequestHandler<{ classId: string }> {
  return async (req: Request<{ classId: string }>, res, next) => {
    try {
      const result = await service.details(req.params.classId, {
        includeStudents: (req.query.includeStudents ?? 'false') === 'true',
        includeHistory: (req.query.includeHistory ?? 'false') === 'true',
      })
      if (result.kind === 'not_found') {
        res.status(404).json({ success: false, message: 'Turma não encontrada' })
        return
      }
      res.json(successResponse(result.data, { timestamp: result.timestamp }))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_DETAILS_FAILED', publicMessage: 'Erro ao buscar detalhes da turma.', cause: error }))
    }
  }
}

export function createFetchClassDataController(service: Service): RequestHandler {
  return async (req, res, next) => {
    try {
      const { classIds, includeStudents, includeStats } = req.query
      const ids = classIds ? (classIds as string).split(',').map(id => id.trim()) : undefined
      const result = await service.fetch(ids, {
        includeStudents: (includeStudents ?? 'false') === 'true',
        includeStats: (includeStats ?? 'true') === 'true',
      })
      res.json(successResponse({ classes: result.classes }, { count: result.classes.length, timestamp: result.timestamp }))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_FETCH_FAILED', publicMessage: 'Erro ao buscar dados das turmas.', cause: error }))
    }
  }
}

export function createFetchClassDataPostController(service: Service): RequestHandler {
  return async (req, res, next) => {
    try {
      const { classIds } = req.body ?? {}
      if (!classIds || !Array.isArray(classIds)) {
        res.status(400).json({ success: false, message: 'classIds é obrigatório e deve ser um array' })
        return
      }

      const result = await service.fetch(classIds, { includeStudents: true, includeStats: false })

      const formatted = result.classes.map(cls => ({
        className: (cls.name as string) || (cls.classId as string),
        students: ((cls.students as FetchedStudent[]) || []).map(student => ({
          name: student.name || '',
          email: student.email || '',
          discordIds: student.discordIds || student.discord?.discordIds || [],
        })),
      }))

      res.json(successResponse(formatted))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_FETCH_POST_FAILED', publicMessage: 'Erro ao buscar dados das turmas.', cause: error }))
    }
  }
}
