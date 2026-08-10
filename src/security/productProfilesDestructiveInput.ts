import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const productProfilesDeleteInput = validatedSchema({
  params: {
    code: z.string().min(1),
  },
  query: {
    hardDelete: z.enum(['true', 'false']).optional(),
  },
  body: {},
})

export type ProductProfilesDeleteInput = z.infer<typeof productProfilesDeleteInput>
