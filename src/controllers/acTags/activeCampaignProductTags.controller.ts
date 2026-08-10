import type { RequestHandler, Response } from 'express'
import type { FilterQuery, Types } from 'mongoose'

import User from '../../models/user'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import activeCampaignService from '../../services/activeCampaign/activeCampaignService'
import type { IUserProduct } from '../../models/UserProduct'
import type {
  ActiveCampaignProductSyncInput,
  ActiveCampaignTagMutationInput,
} from '../../security/activeCampaignDestructiveInput'
import logger from '../../utils/logger'

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

type SyncUserProduct = {
  _id: Types.ObjectId
  userId: PopulatedUser
}

type ProductSyncResults = {
  synced: number
  failed: number
  errors: Array<{ userProductId: Types.ObjectId; error: string }>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const applyTagToUserProduct = async (input: ActiveCampaignTagMutationInput, res: Response): Promise<void> => {
  try {
    const { userId, productId, tagName } = input.body

    if (!userId || !productId || !tagName) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productId, tagName'
      })
      return
    }

    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!user || !product) {
      res.status(404).json({
        success: false,
        message: 'User ou Product não encontrado'
      })
      return
    }

    let userProduct = await UserProduct.findOne({ userId, productId })

    if (!userProduct) {
      userProduct = await UserProduct.create({
        userId,
        productId,
        status: 'ACTIVE',
        progress: { percentage: 0 }
      })
    }

    const acContact = await activeCampaignService.findOrCreateContact(user.email)

    // ✅ USAR TAG DIRETAMENTE (sem adicionar prefixo!)
    // Tag já vem formatada: "OGI_V1 - Inativo 7d"
    await activeCampaignService.addTag(user.email, tagName)  // ← SEM PREFIXO!

    if (!userProduct.activeCampaignData) {
      userProduct.activeCampaignData = {
        contactId: acContact.id,
        tags: [],
        lists: []
      }
    }

    if (!userProduct.activeCampaignData.tags.includes(tagName)) {
      userProduct.activeCampaignData.tags.push(tagName)  // ← SEM PREFIXO!
    }

    userProduct.activeCampaignData.lastSyncAt = new Date()
    await userProduct.save()

    res.json({
      success: true,
      data: {
        userId: user._id,
        productId: product._id,
        productName: product.name,
        tagApplied: tagName,
        acContactId: acContact.id
      },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    logger.error('[AC TAG APPLY ERROR]', error)
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao aplicar tag') })
    return
  }
}


export const removeTagFromUserProduct = async (input: ActiveCampaignTagMutationInput, res: Response): Promise<void> => {
  try {
    const { userId, productId, tagName } = input.body

    if (!userId || !productId || !tagName) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productId, tagName'
      })
      return
    }

    const userProduct = await UserProduct.findOne({ userId, productId })

    if (!userProduct || !userProduct.activeCampaignData) {
      res.status(404).json({
        success: false,
        message: 'UserProduct ou AC data não encontrado'
      })
      return
    }

    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({ success: false, message: 'User não encontrado' })
      return
    }

    await activeCampaignService.findOrCreateContact(user.email)

    // ✅ REMOVER TAG DIRETAMENTE (sem adicionar prefixo!)
    await activeCampaignService.removeTag(user.email, tagName)  // ← SEM PREFIXO!

    userProduct.activeCampaignData.tags = (userProduct.activeCampaignData.tags || []).filter(
      (t: string) => t !== tagName  // ← SEM PREFIXO!
    )

    userProduct.activeCampaignData.lastSyncAt = new Date()
    await userProduct.save()

    res.json({
      success: true,
      data: { userId, productId, tagRemoved: tagName },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    logger.error('[AC TAG REMOVE ERROR]', error)
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao remover tag') })
    return
  }
}

/**
 * GET /api/activecampaign/v2/products/:productId/tagged
 */
export const getUsersWithTagsInProduct: RequestHandler = async (req, res) => {
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
      count: enrichedData.length,
      filters: { productId, tag },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao buscar tags do produto') })
    return
  }
}

/**
 * GET /api/activecampaign/v2/stats
 */
export const getACStats: RequestHandler = async (_req, res) => {
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

    res.json({
      success: true,
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsersWithTags: stats.reduce((sum, s) => sum + s.totalUsersWithTags, 0),
        totalUniqueTags: [...new Set(stats.flatMap(s => s.tagList))].length
      },
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao buscar estatísticas AC') })
    return
  }
}

/**
 * POST /api/activecampaign/v2/sync/:productId
 */
export const syncProductTags = async (input: ActiveCampaignProductSyncInput, res: Response): Promise<void> => {
  try {
    const { productId } = input.params

    const product = await Product.findById(productId)
    if (!product) {
      res.status(404).json({ success: false, message: 'Product não encontrado' })
      return
    }

    const userProducts = await UserProduct.find({ productId })
      .populate('userId', 'email')
      .lean<SyncUserProduct[]>()

    const results: ProductSyncResults = {
      synced: 0,
      failed: 0,
      errors: []
    }

    for (const up of userProducts) {
      try {
        const user = up.userId
        if (!user.email) {
          throw new Error('Utilizador sem email para sincronização ActiveCampaign')
        }
        const acContact = await activeCampaignService.findOrCreateContact(user.email)

        await UserProduct.findByIdAndUpdate(up._id, {
          'activeCampaignData.contactId': acContact.id,
          'activeCampaignData.lastSyncAt': new Date()
        })

        results.synced++
      } catch (error: unknown) {
        results.failed++
        results.errors.push({
          userProductId: up._id,
          error: errorMessage(error, 'Erro ao sincronizar UserProduct')
        })
      }
    }

    res.json({
      success: true,
      data: results,
      productId,
      productName: product.name,
      _v2Enabled: true
    })
    return
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: errorMessage(error, 'Erro ao sincronizar tags') })
    return
  }
}
