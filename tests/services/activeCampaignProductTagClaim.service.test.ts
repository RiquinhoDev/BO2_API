const mockFindOneAndUpdate = jest.fn()

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { findOneAndUpdate: mockFindOneAndUpdate },
}))

import {
  ACTIVE_CAMPAIGN_PRODUCT_TAG_CLAIM_LEASE_MS,
  claimActiveCampaignProductTagMutation,
  releaseActiveCampaignProductTagMutation,
} from '../../src/services/activeCampaign/activeCampaignProductTagClaim.service'
import { ACTIVE_CAMPAIGN_REQUEST_TIMEOUT_MS } from '../../src/services/activeCampaign/activeCampaignTransport'

beforeEach(() => {
  jest.clearAllMocks()
  mockFindOneAndUpdate.mockResolvedValue({ _id: 'product-1' })
})

test('claims with an atomic owner and accepts only absent or expired local leases', async () => {
  const at = new Date('2026-09-05T10:00:00.000Z')
  const owner = await claimActiveCampaignProductTagMutation('product-1', 'tag:COURSE - Active', at)

  expect(owner).toEqual({
    ownerId: expect.any(String),
    expiresAt: new Date(at.getTime() + ACTIVE_CAMPAIGN_PRODUCT_TAG_CLAIM_LEASE_MS),
  })
  expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
    {
      _id: 'product-1',
      $or: [
        { 'activeCampaignData.mutationClaim.expiresAt': { $exists: false } },
        { 'activeCampaignData.mutationClaim.expiresAt': { $lte: at } },
      ],
    },
    {
      $set: {
        'activeCampaignData.mutationClaim': expect.objectContaining({
          ownerId: owner?.ownerId,
          operationKey: 'tag:COURSE - Active',
          claimedAt: at,
          expiresAt: owner?.expiresAt,
        }),
      },
    },
    { new: true },
  )
})

test('release is scoped to the claim owner and lease exceeds provider timeout', async () => {
  await releaseActiveCampaignProductTagMutation('product-1', 'owner-1')

  expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
    {
      _id: 'product-1',
      'activeCampaignData.mutationClaim.ownerId': 'owner-1',
    },
    { $unset: { 'activeCampaignData.mutationClaim': 1 } },
  )
  expect(ACTIVE_CAMPAIGN_PRODUCT_TAG_CLAIM_LEASE_MS).toBeGreaterThan(
    ACTIVE_CAMPAIGN_REQUEST_TIMEOUT_MS,
  )
})
