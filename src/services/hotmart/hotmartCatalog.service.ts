import type { Types } from 'mongoose'
import { Product } from '../../models'
import {
  getUserCountForProduct,
  getUsersByProduct
} from '../userProducts/userProductService'

type ProductEnrollment = {
  product: { _id: Types.ObjectId } | null
  platformSpecificData?: { hotmart?: { status?: string } }
  progress?: { progressPercentage?: number }
}

type ProductUser = {
  products: ProductEnrollment[]
}

type HotmartProductFilters = {
  status?: string
  minProgress?: string
}

export async function listHotmartProducts() {
  return Product.find({ platform: 'hotmart' })
    .select('name code platformData isActive')
    .lean()
}

export async function findHotmartProductBySubdomain(subdomain: string) {
  const product = await Product.findOne({
    platform: 'hotmart',
    subdomain
  }).lean().exec()

  if (!product) return null

  const userCount = await getUserCountForProduct(String(product._id))
  return { ...product, userCount }
}

export async function listHotmartProductUsers(
  subdomain: string,
  filters: HotmartProductFilters
) {
  const product = await Product.findOne({
    platform: 'hotmart',
    subdomain
  })

  if (!product) return null

  const productId = String(product._id)
  let users = await getUsersByProduct(productId)

  if (filters.status) {
    users = users.filter(user =>
      user.products.some((enrollment: ProductUser['products'][number]) =>
        String(enrollment.product?._id) === productId &&
        enrollment.platformSpecificData?.hotmart?.status === filters.status
      )
    )
  }

  if (filters.minProgress) {
    const minimum = Number.parseInt(filters.minProgress, 10)
    users = users.filter(user =>
      user.products.some((enrollment: ProductUser['products'][number]) =>
        String(enrollment.product?._id) === productId &&
        (enrollment.progress?.progressPercentage || 0) >= minimum
      )
    )
  }

  return users
}

export async function getHotmartStatsSnapshot() {
  const products = await Product.find({ platform: 'hotmart' }).lean()

  const stats = await Promise.all(products.map(async product => {
    const productId = String(product._id)
    const users = await getUsersByProduct(productId)
    const activeUsers = users.filter(user =>
      user.products.some((enrollment: ProductUser['products'][number]) =>
        String(enrollment.product?._id) === productId &&
        enrollment.platformSpecificData?.hotmart?.status === 'active'
      )
    ).length

    return {
      productId: product._id,
      productName: product.name,
      subdomain: product.subdomain,
      totalUsers: users.length,
      activeUsers
    }
  }))

  return {
    stats,
    summary: {
      totalProducts: products.length,
      totalUsers: stats.reduce((sum, stat) => sum + stat.totalUsers, 0),
      totalActiveUsers: stats.reduce((sum, stat) => sum + stat.activeUsers, 0)
    }
  }
}
