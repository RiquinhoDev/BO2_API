import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const classId = z.string().trim().min(1)
const empty = {}

export const classAnalyticsQueryInput = validatedSchema({
  params: { classId },
  query: {
    force: z.enum(['true', 'false']).optional(),
  },
  body: empty,
})

export const classAnalyticsClassInput = validatedSchema({
  params: { classId },
  query: empty,
  body: empty,
})

export const classAnalyticsEmptyInput = validatedSchema({
  params: empty,
  query: empty,
  body: empty,
})
