import { randomUUID } from 'node:crypto'
import UserProduct from '../../models/UserProduct'
import { ACTIVE_CAMPAIGN_REQUEST_TIMEOUT_MS } from './activeCampaignTransport'

export const ACTIVE_CAMPAIGN_PRODUCT_TAG_CLAIM_LEASE_MS =
  ACTIVE_CAMPAIGN_REQUEST_TIMEOUT_MS * 4

export interface ActiveCampaignProductTagClaimOwner {
  ownerId: string
  expiresAt: Date
}

export async function claimActiveCampaignProductTagMutation(
  userProductId: unknown,
  operationKey: string,
  at = new Date(),
): Promise<ActiveCampaignProductTagClaimOwner | undefined> {
  const ownerId = randomUUID()
  const expiresAt = new Date(at.getTime() + ACTIVE_CAMPAIGN_PRODUCT_TAG_CLAIM_LEASE_MS)
  const claimed = await UserProduct.findOneAndUpdate(
    {
      _id: userProductId,
      $or: [
        { 'activeCampaignData.mutationClaim.expiresAt': { $exists: false } },
        { 'activeCampaignData.mutationClaim.expiresAt': { $lte: at } },
      ],
    },
    {
      $set: {
        'activeCampaignData.mutationClaim': {
          ownerId,
          operationKey,
          claimedAt: at,
          expiresAt,
        },
      },
    },
    { new: true },
  )
  return claimed === null || claimed === undefined
    ? undefined
    : { ownerId, expiresAt }
}

export async function releaseActiveCampaignProductTagMutation(
  userProductId: unknown,
  ownerId: string,
): Promise<void> {
  await UserProduct.findOneAndUpdate(
    {
      _id: userProductId,
      'activeCampaignData.mutationClaim.ownerId': ownerId,
    },
    { $unset: { 'activeCampaignData.mutationClaim': 1 } },
  )
}
