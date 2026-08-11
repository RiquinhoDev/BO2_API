import type { RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type { ClassDirectoryService, ClassListFilters } from '../../services/classes/classDirectory.service'

type Service = Pick<ClassDirectoryService, 'simpleList' | 'list'>

export function createListClassesSimpleController(service: Service): RequestHandler {
  return async (_req, res, next) => {
    try {

      res.json(successResponse(await service.simpleList()))
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_DIRECTORY_FAILED', publicMessage: 'Erro ao listar turmas.', cause: error }))
    }
  }
}

export function createListClassesController(service: Service): RequestHandler {
  return async (req, res, next) => {
    try {
      const { search, isActive, source, limit, offset, sortBy, sortOrder } = req.query
      const filters: ClassListFilters = {
        search: search as string,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        source: source as string,
        limit: Number(limit ?? 100),
        offset: Number(offset ?? 0),
        sortBy: (sortBy ?? 'name') as string,
        sortOrder: (sortOrder ?? 'asc') as 'asc' | 'desc',
      }

      const result = await service.list(filters)

      res.json({
        success: true,
        data: result.classes,
        classes: result.classes,
        total: result.total,
        filters,
        timestamp: result.timestamp,
      })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_LIST_FAILED', publicMessage: 'Erro ao listar turmas.', cause: error }))
    }
  }
}
