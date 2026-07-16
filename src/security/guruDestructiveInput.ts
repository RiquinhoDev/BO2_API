import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/)
const year = z.string().regex(/^\d+$/)
const month = z.string().regex(/^(?:0?[1-9]|1[0-2])$/)

export const guruInactivationSingleInput = validatedSchema({
  params: {},
  query: {},
  body: {
    userProductId: objectId.optional(),
    curseducaUserId: z.string().min(1).optional(),
  },
})

export const guruInactivationBulkInput = validatedSchema({
  params: {},
  query: {},
  body: {
    userProductIds: z.array(objectId).optional(),
    all: z.boolean().optional(),
  },
})

export const guruSnapshotDeleteInput = validatedSchema({
  params: { year, month },
  query: {},
  body: {},
})

export const guruEmptyInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

export type GuruInactivationSingleInput = z.infer<typeof guruInactivationSingleInput>
export type GuruInactivationBulkInput = z.infer<typeof guruInactivationBulkInput>
export type GuruSnapshotDeleteInput = z.infer<typeof guruSnapshotDeleteInput>
export type GuruEmptyInput = z.infer<typeof guruEmptyInput>
