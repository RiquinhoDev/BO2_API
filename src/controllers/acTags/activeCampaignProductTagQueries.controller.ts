import type { RequestHandler } from 'express'
import type { FilterQuery, Types } from 'mongoose'

import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import type { IUserProduct } from '../../models/UserProduct'
import { successResponse } from '../../contracts/responseContract'
import { internalError } from '../../security/errorHandling'

type PopulatedUser = {
  _id: Types.ObjectId
  name?: string
  email?: string
}

type PopulatedProduct = {
  _id: Types.ObjectId
  name?: string
  code?: string
  platform?: string
}

type PopulatedUserProduct = {
  _id: Types.ObjectId
  userId: PopulatedUser
  productId: Types.ObjectId | PopulatedProduct
  activeCampaignData?: IUserProduct['activeCampaignData']
  progress?: IUserProduct['progress']
}

/**
 * GET /api/activecampaign/products/:productId/tagged
 */
export const getUsersWithTagsInProduct: RequestHandler = async (req, res, next) => {
  try {
    const { productId } = req.params
    const { tag } = req.query

    const product = await Product.findById(productId)
    if (!product) {
      res.status(404).json({ success: false, message: 'Product não encontrado' })
      return
    }

    const query: FilterQuery<IUserProduct> = { productId }
    if (tag) query['activeCampaignData.tags'] = tag

    const userProducts = await UserProduct.find(query)
      .populate('userId', 'name email')
      .populate('productId', 'name code platform')
      .lean<PopulatedUserProduct[]>()

    const enrichedData = userProducts.map(up => ({
      user: up.userId,
      product: up.productId,
      tags: up.activeCampaignData?.tags || [],
      lastSync: up.activeCampaignData?.lastSyncAt,
      progress: up.progress?.percentage || 0
    }))

    res.json({
      success: true,
      data: enrichedData,
      meta: {
        count: enrichedData.length,
        filters: { productId, tag },
      }
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro ao buscar tags do produto', 'AC_PRODUCT_TAGGED_USERS_READ_FAILED', error))
    return
  }
}

/**
 * GET /api/activecampaign/product-tags/stats
 */
export const getACStats: RequestHandler = async (_req, res, next) => {
  try {
    const products = await Product.find().lean()

    const stats = await Promise.all(
      products.map(async product => {
        const userProducts = await UserProduct.find({
          productId: product._id,
          'activeCampaignData.tags': { $exists: true, $ne: [] }
        }).lean()

        const allTags = userProducts.flatMap(up => up.activeCampaignData?.tags || [])
        const uniqueTags = [...new Set(allTags)]

        return {
          productId: product._id,
          productName: product.name,
          platform: product.platform,
          totalUsersWithTags: userProducts.length,
          uniqueTags: uniqueTags.length,
          tagList: uniqueTags
        }
      })
    )

    res.json(successResponse(stats, {
      summary: {
        totalProducts: products.length,
        totalUsersWithTags: stats.reduce((sum, stat) => sum + stat.totalUsersWithTags, 0),
        totalUniqueTags: [...new Set(stats.flatMap(stat => stat.tagList))].length,
      },
    }))
    return
  } catch (error: unknown) {
    next(internalError('Erro ao buscar estatísticas AC', 'AC_PRODUCT_TAG_STATS_READ_FAILED', error))
    return
  }
}
