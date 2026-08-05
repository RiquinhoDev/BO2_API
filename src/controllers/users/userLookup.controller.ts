import type { RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type {
  EnrichedUserReader,
  UserProductsReader,
} from '../../services/users/userLookup.contract'

type UserIdParams = { id: string }
type UserProductsParams = { userId: string }

export function createGetUserByIdController(
  reader: EnrichedUserReader,
): RequestHandler<UserIdParams> {
  return async (req, res, next) => {
    try {
      const user = await reader.findEnriched(req.params.id)

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' })
        return
      }

      res.json({ success: true, data: user })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USER_LOOKUP_FAILED',
        publicMessage: 'Erro ao buscar utilizador',
        cause: error,
      }))
    }
  }
}

export function createGetUserProductsController(
  reader: UserProductsReader,
): RequestHandler<UserProductsParams> {
  return async (req, res, next) => {
    try {
      const userProducts = await reader.listByUser(req.params.userId)

      // Always 200, even for an unknown user or an empty list.
      res.json({
        success: true,
        data: userProducts,
        count: userProducts.length,
      })
    } catch (error) {
      next(new HttpError({
        status: 500,
        code: 'USER_PRODUCTS_FAILED',
        publicMessage: 'Erro ao buscar produtos do utilizador',
        cause: error,
      }))
    }
  }
}
