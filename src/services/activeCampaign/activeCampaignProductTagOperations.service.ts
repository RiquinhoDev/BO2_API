import type { Types } from 'mongoose'

import UserProduct from '../../models/UserProduct'
import activeCampaignService from './activeCampaignService'
import {
  claimActiveCampaignProductTagMutation,
  releaseActiveCampaignProductTagMutation,
} from './activeCampaignProductTagClaim.service'
import {
  activeCampaignProductTagIdentity,
  executeActiveCampaignProductTag,
  ActiveCampaignProductTagMutationIndeterminateError,
  ActiveCampaignProductTagMutationInProgressError,
  type ActiveCampaignProductTagExecutionOutcome,
} from './activeCampaignProductTagExecution.service'

type UserLike = { _id: Types.ObjectId; email: string }
type ProductLike = { _id: Types.ObjectId; name: string }
type UserProductLike = {
  _id: Types.ObjectId
  activeCampaignData?: { tags?: string[] }
}

export type ApplyTagResult = {
  success: true
  data: {
    userId: Types.ObjectId
    productId: Types.ObjectId
    productName: string
    tagApplied: string
    acContactId: string
  }
}

export type RemoveTagResult = {
  success: true
  data: { userId: Types.ObjectId; productId: string; tagRemoved: string }
}

export type ProductTagOperationOutcome<T> = ActiveCampaignProductTagExecutionOutcome<T>

type BaseOperation = {
  user: UserLike
  userProduct: UserProductLike
  requestId: string
}

type ApplyOperation = BaseOperation & { product: ProductLike; tagName: string }

export async function applyProductTagOperation({
  user,
  product,
  userProduct,
  tagName,
  requestId,
}: ApplyOperation): Promise<ProductTagOperationOutcome<ApplyTagResult>> {
  return executeActiveCampaignProductTag({
    operation: 'apply',
    identity: activeCampaignProductTagIdentity(userProduct._id, `tag:${tagName}`),
    requestId,
    run: async ({ lease, provider }): Promise<ApplyTagResult> => {
      const claim = await claimActiveCampaignProductTagMutation(userProduct._id, `tag:${tagName}`)
      if (!claim) throw new ActiveCampaignProductTagMutationInProgressError()

      let terminalCommitted = false
      try {
        provider.begin()
        const acContact = await activeCampaignService.findOrCreateContact(user.email)
        provider.success()
        lease.assertOwnership()

        provider.begin()
        await activeCampaignService.addTag(user.email, tagName)
        provider.success()
        lease.assertOwnership()

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
        if (!committed) throw new ActiveCampaignProductTagMutationIndeterminateError()
        terminalCommitted = true

        return {
          success: true,
          data: {
            userId: user._id,
            productId: product._id,
            productName: product.name,
            tagApplied: tagName,
            acContactId: acContact.id,
          },
        }
      } finally {
        if (!terminalCommitted) {
          await releaseActiveCampaignProductTagMutation(userProduct._id, claim.ownerId)
        }
      }
    },
  })
}

export async function removeProductTagOperation({
  user,
  userProduct,
  tagName,
  productId,
  requestId,
}: Omit<BaseOperation, 'requestId'> & {
  productId: string
  tagName: string
  requestId: string
}): Promise<ProductTagOperationOutcome<RemoveTagResult>> {
  return executeActiveCampaignProductTag({
    operation: 'remove',
    identity: activeCampaignProductTagIdentity(userProduct._id, `tag:${tagName}`),
    requestId,
    run: async ({ lease, provider }): Promise<RemoveTagResult> => {
      const claim = await claimActiveCampaignProductTagMutation(userProduct._id, `tag:${tagName}`)
      if (!claim) throw new ActiveCampaignProductTagMutationInProgressError()

      let terminalCommitted = false
      try {
        provider.begin()
        await activeCampaignService.findOrCreateContact(user.email)
        provider.success()
        lease.assertOwnership()

        provider.begin()
        const removed = await activeCampaignService.removeTag(user.email, tagName)
        if (!removed) throw new Error('ActiveCampaign não confirmou a remoção da tag')
        provider.success()
        lease.assertOwnership()

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
        if (!committed) throw new ActiveCampaignProductTagMutationIndeterminateError()
        terminalCommitted = true

        return {
          success: true,
          data: { userId: user._id, productId, tagRemoved: tagName },
        }
      } finally {
        if (!terminalCommitted) {
          await releaseActiveCampaignProductTagMutation(userProduct._id, claim.ownerId)
        }
      }
    },
  })
}

export async function syncProductTagOperation({
  user,
  userProduct,
  requestId,
}: Pick<BaseOperation, 'user' | 'userProduct' | 'requestId'>): Promise<
  ProductTagOperationOutcome<true>
> {
  return executeActiveCampaignProductTag({
    operation: 'sync',
    identity: activeCampaignProductTagIdentity(userProduct._id, 'sync'),
    requestId,
    run: async ({ lease, provider }): Promise<true> => {
      const claim = await claimActiveCampaignProductTagMutation(userProduct._id, 'sync')
      if (!claim) throw new ActiveCampaignProductTagMutationInProgressError()

      let terminalCommitted = false
      try {
        provider.begin()
        const acContact = await activeCampaignService.findOrCreateContact(user.email)
        provider.success()
        lease.assertOwnership()

        const committed = await UserProduct.findOneAndUpdate(
          {
            _id: userProduct._id,
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
        if (!committed) throw new ActiveCampaignProductTagMutationIndeterminateError()
        terminalCommitted = true
        return true
      } finally {
        if (!terminalCommitted) {
          await releaseActiveCampaignProductTagMutation(userProduct._id, claim.ownerId)
        }
      }
    },
  })
}
