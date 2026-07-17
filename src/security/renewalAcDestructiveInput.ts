import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const actor = z.string().min(1).optional()
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/)

export const renewalAcExecuteInput = validatedSchema({
  params: {},
  query: {},
  body: {
    batchId: z.string().min(1).optional(),
    includePlanned: z.boolean().optional(),
    actor,
  },
})

export const renewalAcRevertInput = validatedSchema({
  params: {
    id: objectId,
  },
  query: {},
  body: { actor },
})
