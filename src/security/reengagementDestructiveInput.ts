import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const reengagementExecuteInput = validatedSchema({
  params: {
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  },
  query: {},
  body: {
    productCode: z.string().min(1),
    dryRun: z.boolean().optional(),
  },
})

export type ReengagementExecuteInput = z.infer<typeof reengagementExecuteInput>
