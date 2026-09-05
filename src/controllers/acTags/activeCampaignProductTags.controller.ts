import type { NextFunction, Response } from 'express'
import type { Types } from 'mongoose'

import User from '../../models/user'
import Product from '../../models/product/Product'
import UserProduct from '../../models/UserProduct'
import activeCampaignService from '../../services/activeCampaign/activeCampaignService'
import type {
  ActiveCampaignProductSyncInput,
  ActiveCampaignTagMutationInput,
} from '../../security/activeCampaignDestructiveInput'
import { HttpError, internalError } from '../../security/errorHandling'
import { successResponse } from '../../contracts/responseContract'
import type { ValidatedRequest } from '../../security/validatedInput'
import { MAX_PRODUCT_TAG_SYNC_ITEMS } from '../../services/activeCampaign/activeCampaignProductTags.service'
import {
  claimActiveCampaignProductTagMutation,
  releaseActiveCampaignProductTagMutation,
} from '../../services/activeCampaign/activeCampaignProductTagClaim.service'
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

const MUTATION_CLAIM_LOST_MESSAGE =
  'Mutação de tag ActiveCampaign perdeu o claim antes de guardar o estado local'

function mutationClaimLostError(): HttpError {
  return new HttpError({
    status: 409,
    code: 'AC_PRODUCT_TAG_MUTATION_LOST',
    publicMessage: MUTATION_CLAIM_LOST_MESSAGE,
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const applyTagToUserProduct = async (
  input: ActiveCampaignTagMutationInput,
  _req: ValidatedRequest,
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
        progress: { percentage: 0 }
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

    if (userProduct._id === undefined) {
      next(mutationClaimLostError())
      return
    }
    const claim = await claimActiveCampaignProductTagMutation(userProduct._id, `tag:${tagName}`)
    if (claim === undefined) {
      next(new HttpError({
        status: 409,
        code: 'AC_PRODUCT_TAG_MUTATION_IN_PROGRESS',
        publicMessage: 'Mutação de tag ActiveCampaign já está em processamento',
      }))
      return
    }

    let terminalCommitted = false
    try {
      const acContact = await activeCampaignService.findOrCreateContact(user.email)
      // ✅ USAR TAG DIRETAMENTE (sem adicionar prefixo!)
      // Tag já vem formatada: "OGI_V1 - Inativo 7d"
      await activeCampaignService.addTag(user.email, tagName)  // ← SEM PREFIXO!

      const terminalUpdate = {
        $set: {
          'activeCampaignData.contactId': acContact.id,
          'activeCampaignData.lastSyncAt': new Date(),
          ...(!userProduct.activeCampaignData
            ? { 'activeCampaignData.lists': [] }
            : {}),
        },
        $addToSet: { 'activeCampaignData.tags': tagName },
        $unset: { 'activeCampaignData.mutationClaim': 1 },
      }
      const committed = await UserProduct.findOneAndUpdate(
        {
          _id: userProduct._id,
          'activeCampaignData.mutationClaim.ownerId': claim.ownerId,
        },
        terminalUpdate,
        { new: true },
      )
      if (!committed) {
        next(mutationClaimLostError())
        return
      }
      terminalCommitted = true

      res.json({
        success: true,
        data: {
          userId: user._id,
          productId: product._id,
          productName: product.name,
          tagApplied: tagName,
          acContactId: acContact.id
        },
      })
    } finally {
      if (!terminalCommitted) {
        await releaseActiveCampaignProductTagMutation(userProduct._id, claim.ownerId)
      }
    }
    return
  } catch (error: unknown) {
    next(internalError('Erro ao aplicar tag', 'AC_PRODUCT_TAG_APPLY_FAILED', error))
    return
  }
}


export const removeTagFromUserProduct = async (
  input: ActiveCampaignTagMutationInput,
  _req: ValidatedRequest,
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

    if (userProduct._id === undefined) {
      next(mutationClaimLostError())
      return
    }
    const claim = await claimActiveCampaignProductTagMutation(userProduct._id, `tag:${tagName}`)
    if (claim === undefined) {
      next(new HttpError({
        status: 409,
        code: 'AC_PRODUCT_TAG_MUTATION_IN_PROGRESS',
        publicMessage: 'Mutação de tag ActiveCampaign já está em processamento',
      }))
      return
    }

    let terminalCommitted = false
    try {
      await activeCampaignService.findOrCreateContact(user.email)
      // ✅ REMOVER TAG DIRETAMENTE (sem adicionar prefixo!)
      const removed = await activeCampaignService.removeTag(user.email, tagName)  // ← SEM PREFIXO!
      if (!removed) {
        next(internalError(
          'Erro ao remover tag',
          'AC_PRODUCT_TAG_REMOVE_FAILED',
          new Error('ActiveCampaign não confirmou a remoção da tag'),
        ))
        return
      }

      const committed = await UserProduct.findOneAndUpdate(
        {
          _id: userProduct._id,
          'activeCampaignData.mutationClaim.ownerId': claim.ownerId,
        },
        {
          $pull: { 'activeCampaignData.tags': tagName },
          $set: { 'activeCampaignData.lastSyncAt': new Date() },
          $unset: { 'activeCampaignData.mutationClaim': 1 },
        },
        { new: true },
      )
      if (!committed) {
        next(mutationClaimLostError())
        return
      }
      terminalCommitted = true

      res.json({
        success: true,
        data: { userId, productId, tagRemoved: tagName },
      })
    } finally {
      if (!terminalCommitted) {
        await releaseActiveCampaignProductTagMutation(userProduct._id, claim.ownerId)
      }
    }
    return
  } catch (error: unknown) {
    next(internalError('Erro ao remover tag', 'AC_PRODUCT_TAG_REMOVE_FAILED', error))
    return
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
  _req: ValidatedRequest,
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
        const claim = await claimActiveCampaignProductTagMutation(up._id, 'sync')
        if (claim === undefined) {
          results.failed++
          results.errors.push({
            userProductId: up._id,
            error: 'Mutação de tag ActiveCampaign já está em processamento',
            inProgress: true,
          })
          continue
        }
        let terminalCommitted = false
        try {
          const acContact = await activeCampaignService.findOrCreateContact(user.email)
          const committed = await UserProduct.findOneAndUpdate(
            {
              _id: up._id,
              'activeCampaignData.mutationClaim.ownerId': claim.ownerId,
            },
            {
              $set: {
                'activeCampaignData.contactId': acContact.id,
                'activeCampaignData.lastSyncAt': new Date(),
              },
              $unset: { 'activeCampaignData.mutationClaim': 1 },
            },
            { new: true },
          )
          if (!committed) throw new Error(MUTATION_CLAIM_LOST_MESSAGE)

          terminalCommitted = true
          results.synced++
        } finally {
          if (!terminalCommitted) {
            await releaseActiveCampaignProductTagMutation(up._id, claim.ownerId)
          }
        }
      } catch (error: unknown) {
        results.failed++
        results.errors.push({
          userProductId: up._id,
          error: errorMessage(error, 'Erro ao sincronizar UserProduct')
        })
      }
    }

    res.json(successResponse(results, { productId, productName: product.name }))
    return
  } catch (error: unknown) {
    next(internalError('Erro ao sincronizar tags', 'AC_PRODUCT_TAG_SYNC_FAILED', error))
    return
  }
}
