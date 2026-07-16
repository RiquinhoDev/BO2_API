import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const cronTagsExecuteInput = validatedSchema({
  params: {},
  query: {},
  body: {
    userId: z.string().min(1).optional(),
  },
})

export type CronTagsExecuteInput = z.infer<typeof cronTagsExecuteInput>
