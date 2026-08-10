import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { UserDirectoryService } from '../../services/users/userDirectory.service'

export function createUserDirectoryController(
  service: Pick<UserDirectoryService, 'get'>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await service.get(req.query)
      res.json(result)
    } catch (error) {
      // SEC-10: the legacy handler answered 500 with the raw error message;
      // route the failure through the central handler with a stable code.
      next(new HttpError({
        status: 500,
        code: 'USER_DIRECTORY_FAILED',
        publicMessage: 'Erro ao buscar utilizadores.',
        cause: error,
      }))
    }
  }
}
