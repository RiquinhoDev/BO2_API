import type { NextFunction, Response } from 'express'
import type { Types } from 'mongoose'

import User from '../../models/user'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import type {
  ActiveCampaignProductSyncInput,
  ActiveCampaignTagMutationInput,
} from '../../security/activeCampaignDestructiveInput'
import { HttpError, internalError } from '../../security/errorHandling'
import { successResponse } from '../../contracts/responseContract'
import type { ValidatedRequest } from '../../security/validatedInput'
import { MAX_PRODUCT_TAG_SYNC_ITEMS } from '../../services/activeCampaign/activeCampaignProductTags.service'
import { requestIdFrom } from '../../services/activeCampaign/activeCampaignExecution.service'
import {
  applyProductTagOperation,
  removeProductTagOperation,
  syncProductTagOperation,
} from '../../services/activeCampaign/activeCampaignProductTagOperations.service'
import {
  ActiveCampaignProductTagMutationIndeterminateError,
  ActiveCampaignProductTagMutationInProgressError,
} from '../../services/activeCampaign/activeCampaignProductTagExecution.service'
import { isActiveCampaignTagMutationEnabled } from '../../services/requestDrivenRuntimeConfig'

type SyncUserProduct = {
  _id: Types.ObjectId
  userId: {
    _id: Types.ObjectId
    email?: string
  }
}

type ProductSyncResults = {
  synced: number
  failed: number
  errors: Array<{ userProductId: Types.ObjectId; error: string; inProgress?: boolean }>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const applyTagToUserProduct = async (
  input: ActiveCampaignTagMutationInput,
  req: ValidatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId, productId, tagName, dryRun } = input.body

    if (dryRun !== true && !isActiveCampaignTagMutationEnabled()) {
      next(new HttpError({
        status: 503,
        code: 'AC_PRODUCT_TAG_MUTATION_DISABLED',
        publicMessage: 'Mutações de tags ActiveCampaign desativadas',
      }))
      return
    }

    if (!userId || !productId || !tagName) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productId, tagName',
      })
      return
    }

    const user = await User.findById(userId)
    const product = await Product.findById(productId)

    if (!user || !product) {
      res.status(404).json({
        success: false,
        message: 'User ou Product não encontrado',
      })
      return
    }

    let userProduct = await UserProduct.findOne({ userId, productId })

    if (!userProduct && dryRun === true) {
      res.json(successResponse({
        dryRun: true,
        planned: true,
        userId: user._id,
        productId: product._id,
        productName: product.name,
        tagName,
      }))
      return
    }

    if (!userProduct) {
      userProduct = await UserProduct.create({
        userId,
        productId,
        status: 'ACTIVE',
        progress: { percentage: 0 },
      })
    }

    if (dryRun === true) {
      res.json(successResponse({
        dryRun: true,
        planned: !(userProduct.activeCampaignData?.tags || []).includes(tagName),
        userId: user._id,
        productId: product._id,
        productName: product.name,
        tagName,
      }))
      return
    }

    const outcome = await applyProductTagOperation({
      user,
      product,
      userProduct,
      tagName,
      requestId: requestIdFrom(req.get('x-request-id') || res.locals.correlationId),
    })
    if (outcome.kind === 'completed' || outcome.kind === 'replay') {
      res.json(outcome.result)
      return
    }
    if (outcome.kind === 'in-progress') {
      next(new ActiveCampaignProductTagMutationInProgressError())
      return
    }
    next(new ActiveCampaignProductTagMutationIndeterminateError())
  } catch (error: unknown) {
    next(internalError('Erro ao aplicar tag', 'AC_PRODUCT_TAG_APPLY_FAILED', error))
  }
}

export const removeTagFromUserProduct = async (
  input: ActiveCampaignTagMutationInput,
  req: ValidatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId, productId, tagName, dryRun } = input.body

    if (dryRun !== true && !isActiveCampaignTagMutationEnabled()) {
      next(new HttpError({
        status: 503,
        code: 'AC_PRODUCT_TAG_MUTATION_DISABLED',
        publicMessage: 'Mutações de tags ActiveCampaign desativadas',
      }))
      return
    }

    if (!userId || !productId || !tagName) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productId, tagName',
      })
      return
    }

    const userProduct = await UserProduct.findOne({ userId, productId })

    if (!userProduct || !userProduct.activeCampaignData) {
      res.status(404).json({
        success: false,
        message: 'UserProduct ou AC data não encontrado',
      })
      return
    }

    const user = await User.findById(userId)
    if (!user) {
      res.status(404).json({ success: false, message: 'User não encontrado' })
      return
    }

    if (dryRun === true) {
      res.json(successResponse({
        dryRun: true,
        planned: (userProduct.activeCampaignData.tags || []).includes(tagName),
        userId,
        productId,
        tagName,
      }))
      return
    }

    const outcome = await removeProductTagOperation({
      user,
      userProduct,
      productId,
      tagName,
      requestId: requestIdFrom(req.get('x-request-id') || res.locals.correlationId),
    })
    if (outcome.kind === 'completed' || outcome.kind === 'replay') {
      res.json(outcome.result)
      return
    }
    if (outcome.kind === 'in-progress') {
      next(new ActiveCampaignProductTagMutationInProgressError())
      return
    }
    next(new ActiveCampaignProductTagMutationIndeterminateError())
  } catch (error: unknown) {
    next(internalError('Erro ao remover tag', 'AC_PRODUCT_TAG_REMOVE_FAILED', error))
  }
}

export {
  getACStats,
  getUsersWithTagsInProduct,
} from './activeCampaignProductTagQueries.controller'

/**
 * POST /api/activecampaign/products/:productId/tags/sync
 */
export const syncProductTags = async (
  input: ActiveCampaignProductSyncInput,
  req: ValidatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { productId } = input.params
    const dryRun = input.body.dryRun === true

    if (!dryRun && !isActiveCampaignTagMutationEnabled()) {
      next(new HttpError({
        status: 503,
        code: 'AC_PRODUCT_TAG_MUTATION_DISABLED',
        publicMessage: 'Mutações de tags ActiveCampaign desativadas',
      }))
      return
    }

    const product = await Product.findById(productId)
    if (!product) {
      res.status(404).json({ success: false, message: 'Product não encontrado' })
      return
    }

    const userProductsQuery = UserProduct.find({ productId })
      .limit(MAX_PRODUCT_TAG_SYNC_ITEMS + 1)
    const userProducts = await userProductsQuery
      .populate('userId', 'email')
      .lean<SyncUserProduct[]>()

    if (userProducts.length > MAX_PRODUCT_TAG_SYNC_ITEMS) {
      next(new HttpError({
        status: 413,
        code: 'AC_PRODUCT_TAG_SYNC_LIMIT_EXCEEDED',
        publicMessage: `Sincronização ActiveCampaign limitada a ${MAX_PRODUCT_TAG_SYNC_ITEMS} registos por execução`,
      }))
      return
    }

    if (dryRun) {
      const errors = userProducts
        .filter((up) => !up.userId.email)
        .map((up) => ({
          userProductId: up._id,
          error: 'Utilizador sem email para sincronização ActiveCampaign',
        }))
      res.json(successResponse({
        synced: 0,
        failed: errors.length,
        errors,
        dryRun: true,
        planned: userProducts.length - errors.length,
      }, { productId, productName: product.name }))
      return
    }

    const results: ProductSyncResults = { synced: 0, failed: 0, errors: [] }
    const requestId = requestIdFrom(req.get('x-request-id') || res.locals.correlationId)

    for (const up of userProducts) {
      try {
        const user = up.userId
        if (!user.email) throw new Error('Utilizador sem email para sincronização ActiveCampaign')

        const outcome = await syncProductTagOperation({
          user: { _id: user._id, email: user.email },
          userProduct: up,
          requestId,
        })
        if (outcome.kind === 'completed' || outcome.kind === 'replay') {
          results.synced++
          continue
        }

        results.failed++
        results.errors.push({
          userProductId: up._id,
          error: outcome.kind === 'in-progress'
            ? 'Mutação de tag ActiveCampaign já está em processamento'
            : 'Resultado da mutação ActiveCampaign ficou indeterminado; requer reconciliação',
          ...(outcome.kind === 'in-progress' ? { inProgress: true } : {}),
        })
      } catch (error: unknown) {
        results.failed++
        results.errors.push({
          userProductId: up._id,
          error: errorMessage(error, 'Erro ao sincronizar UserProduct'),
        })
      }
    }

    res.json(successResponse(results, { productId, productName: product.name }))
  } catch (error: unknown) {
    next(internalError('Erro ao sincronizar tags', 'AC_PRODUCT_TAG_SYNC_FAILED', error))
  }
}
