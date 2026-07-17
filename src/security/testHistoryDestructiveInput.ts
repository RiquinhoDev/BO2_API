import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const testHistoryDeleteEventsInput = validatedSchema({
  params: {},
  query: {},
  body: {
    email: z.string().email(),
  },
})

export type TestHistoryDeleteEventsInput = z.infer<typeof testHistoryDeleteEventsInput>
