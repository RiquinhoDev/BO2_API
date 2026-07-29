import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const classQuickStatsInput = validatedSchema({
  params: {
    classId: z.string().trim().min(1),
  },
  query: {},
  body: {},
})
