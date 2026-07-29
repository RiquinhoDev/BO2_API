import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const classIds = z.string()
  .transform((value) =>
    value
      .split(',')
      .map((classId) => classId.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1)).min(2).max(10))

export const classComparisonInput = validatedSchema({
  params: {},
  query: { classIds },
  body: {},
})
