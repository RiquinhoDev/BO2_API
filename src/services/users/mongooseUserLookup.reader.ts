import { UserProduct } from '../../models'
import { getUserWithProducts } from '../userProducts/userProductService'
import type { EnrichedUserReader, UserProductsReader } from './userLookup.contract'

export class UserProductsServiceEnrichedUserReader implements EnrichedUserReader {
  async findEnriched(id: string): Promise<unknown | null> {
    return getUserWithProducts(id)
  }
}

export class MongooseUserProductsReader implements UserProductsReader {
  /**
   * Deliberately does not check that the user exists: the legacy endpoint
   * answers 200 with an empty list for an unknown id.
   */
  async listByUser(userId: string): Promise<unknown[]> {
    return UserProduct.find({ userId })
      .populate('productId', 'name code platform')
      .populate('userId', 'name email')
      .lean()
  }
}
