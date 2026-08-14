import { z } from 'zod'
import { MAX_BULK_OPERATION_ITEMS } from './bulkOperationPolicy'
import { validatedSchema } from './validatedInput'

const nonEmptyString = z.string().trim().min(1)
const ids = z.array(nonEmptyString).min(1).max(MAX_BULK_OPERATION_ITEMS)

export const userIdentityMergeInput = validatedSchema({
  params: {},
  query: {},
  body: {
    id: nonEmptyString.optional(),
    email: nonEmptyString,
    newDiscordId: nonEmptyString,
  },
})

export const userIdentityManualMatchInput = validatedSchema({
  params: {},
  query: {},
  body: {
    discordId: nonEmptyString,
    email: nonEmptyString,
  },
})

export const userIdentityBulkMergeInput = validatedSchema({
  params: {},
  query: {},
  body: { ids },
})
