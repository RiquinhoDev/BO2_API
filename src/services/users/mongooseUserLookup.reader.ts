import { UserProduct } from '../../models'
import User from '../../models/user'
import { getUserWithProducts } from '../userProducts/userProductService'
import type { EnrichedUserByEmailReader, EnrichedUserReader, UserProductsReader } from './userLookup.contract'

export class UserProductsServiceEnrichedUserReader implements EnrichedUserReader {
  async findEnriched(id: string): Promise<unknown | null> {
    return getUserWithProducts(id)
  }
}

export class UserProductsServiceEnrichedUserByEmailReader implements EnrichedUserByEmailReader {
  async findEnrichedByEmail(email: string): Promise<unknown | null> {
    const user = await User.findOne({ email }).lean()
    if (!user?._id) return null
    return getUserWithProducts(user._id.toString())
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
