import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/)

export const activeCampaignEmptyInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

export const activeCampaignTagRuleDeleteInput = validatedSchema({
  params: { id: objectId },
  query: {},
  body: {},
})

export const activeCampaignProductSyncInput = validatedSchema({
  params: { productId: objectId },
  query: {},
  body: {},
})

export const activeCampaignTagMutationInput = validatedSchema({
  params: {},
  query: {},
  body: {
    userId: objectId,
    productId: objectId,
    tagName: z.string().min(1),
  },
})

export type ActiveCampaignEmptyInput = z.infer<typeof activeCampaignEmptyInput>
export type ActiveCampaignTagRuleDeleteInput = z.infer<typeof activeCampaignTagRuleDeleteInput>
export type ActiveCampaignProductSyncInput = z.infer<typeof activeCampaignProductSyncInput>
export type ActiveCampaignTagMutationInput = z.infer<typeof activeCampaignTagMutationInput>
