import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import type {
  UsersV2ComparisonReader,
  UsersV2ComparisonSnapshot,
} from './usersV2Analytics.service'

interface StringifiableId {
  toString(): string
}

interface ComparisonProductLeanRow {
  _id: StringifiableId
  name: string
  platform: string
}

interface ComparisonEnrollmentLeanRow {
  userId: StringifiableId
  productId: StringifiableId
  platform: string
  engagement?: unknown
}

export class MongooseUsersV2ComparisonReader
implements UsersV2ComparisonReader {
  async read(): Promise<UsersV2ComparisonSnapshot> {
    const [productRows, enrollmentRows] = await Promise.all([
      Product.find({})
        .select('_id name platform')
        .lean<ComparisonProductLeanRow[]>(),
      UserProduct.find({ status: 'ACTIVE' })
        .select('userId productId platform engagement')
        .lean<ComparisonEnrollmentLeanRow[]>(),
    ])

    return {
      products: productRows.map(product => ({
        id: product._id.toString(),
        name: product.name,
        platform: product.platform,
      })),
      enrollments: enrollmentRows.map(enrollment => ({
        userId: enrollment.userId.toString(),
        productId: enrollment.productId.toString(),
        platform: enrollment.platform,
        engagement: enrollment.engagement,
      })),
    }
  }
}
