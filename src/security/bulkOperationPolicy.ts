import type { RequestHandler } from 'express'
import { HttpError } from './errorHandling'

export const MAX_BULK_OPERATION_ITEMS = 200

function bulkLimitError(): HttpError {
  return new HttpError({
    status: 400,
    code: 'INVALID_REQUEST',
    publicMessage: 'Pedido inválido',
  })
}

export function enforceBulkBodyArrayLimit(field: string): RequestHandler {
  return (req, _res, next) => {
    const body = req.body
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return next()
    }

    const value = Reflect.get(body, field)
    if (Array.isArray(value) && value.length > MAX_BULK_OPERATION_ITEMS) {
      return next(bulkLimitError())
    }

    return next()
  }
}
