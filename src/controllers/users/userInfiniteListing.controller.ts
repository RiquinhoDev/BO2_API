import type { Request, RequestHandler } from 'express'
import { successResponse } from '../../contracts/responseContract'
import { HttpError } from '../../security/errorHandling'
import type {
  InfiniteListingParams,
  UserInfiniteListingService,
} from '../../services/users/userInfiniteListing.service'

function parseParams(query: Request['query']): InfiniteListingParams {
  return {
    cursor: query.cursor as string | undefined,
    limit: Math.min(100, Math.max(10, parseInt(query.limit as string, 10) || 50)),
    search: query.search?.toString().trim(),
    status: query.status as string | undefined,
    engagementLevel: query.engagementLevel as string | undefined,
    source: query.source as string | undefined,
    includePreCalculated: query.includePreCalculated === 'true',
    forceRefresh: query.forceRefresh === 'true',
  }
}

export function createUserInfiniteListingController(
  service: Pick<UserInfiniteListingService, 'list'>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await service.list(parseParams(req.query))

      if (result.kind === 'cache') {
        const { users, hasMore, nextCursor, totalCount, meta, cachedAt } = result.data
        res.status(200).json(successResponse(users, {
          ...meta,
          hasMore,
          nextCursor,
          ...(totalCount !== undefined ? { totalCount } : {}),
          cachedAt,
          fromCache: true,
          cacheAge: Date.now() - (cachedAt || Date.now()),
          timestamp: new Date().toISOString(),
        }))
        return
      }

      const { users, hasMore, nextCursor, totalCount, meta, cachedAt } = result.data
      res.status(200).json(successResponse(users, {
        ...meta,
        hasMore,
        nextCursor,
        ...(totalCount !== undefined ? { totalCount } : {}),
        cachedAt,
        timestamp: new Date().toISOString(),
      }))
    } catch (error) {
      // SEC-10: replace the legacy local 500 (which branched on nodeEnv to decide
      // whether to leak the error) with the central handler.
      next(new HttpError({
        status: 500,
        code: 'USER_INFINITE_LISTING_FAILED',
        publicMessage: 'Erro ao carregar utilizadores.',
        cause: error,
      }))
    }
  }
}
