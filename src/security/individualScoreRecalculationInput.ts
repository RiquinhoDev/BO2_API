import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const individualScoreRecalculationInput = validatedSchema({
  params: {
    classId: z.string().trim().min(1).max(256),
  },
  query: {},
  body: {},
})
