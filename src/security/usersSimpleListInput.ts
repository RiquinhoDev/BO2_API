import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const positiveIntegerString = z.string().regex(/^[1-9]\d*$/)

export const usersSimpleListInput = validatedSchema({
  params: {},
  query: {
    page: positiveIntegerString.optional(),
    limit: positiveIntegerString.optional(),
    status: z.enum(['active', 'inactive']).optional(),
  },
  body: {},
})

export type UsersSimpleListInput = z.infer<typeof usersSimpleListInput>
export type UsersSimpleListSchema = typeof usersSimpleListInput
