import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { UserListCriteria } from '../../services/users/userList.contract'
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  type UserListService,
} from '../../services/users/userList.service'

/** Mirrors the legacy destructuring: absent means the default, anything else is coerced. */
function readNumber(value: unknown, fallback: number): number {
  return Number(value === undefined ? fallback : value)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function createUserListController(
  service: Pick<UserListService, 'list'>,
): RequestHandler {
  return async (req, res, next) => {
    const query = req.query as Record<string, unknown>

    const page = readNumber(query.page, DEFAULT_PAGE)
    const limit = readNumber(query.limit, DEFAULT_LIMIT)

    const search = readText(query.search)
    const status = readText(query.status)
    const hasDiscord = readText(query.hasDiscord)
    const hasHotmart = readText(query.hasHotmart)

    const criteria: UserListCriteria = { search, status, hasDiscord, hasHotmart }

    try {
      const result = await service.list(criteria, page, limit)

      res.status(200).json({
        users: result.users,
        count: result.count,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        // Always true: the projection carries the progress field.
        hasProgress: true,
        // Echoed verbatim, including filters the query may have discarded.
        filters: {
          search: search || null,
          status: status || null,
          hasDiscord: hasDiscord || null,
          hasHotmart: hasHotmart || null,
        },
      })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USER_LIST_FAILED',
        publicMessage: 'Erro ao buscar utilizadores',
        cause: error,
      }))
    }
  }
}
