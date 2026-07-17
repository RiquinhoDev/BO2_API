import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const testimonialsDeleteInput = validatedSchema({
  params: {
    id: z.string().regex(/^[0-9a-fA-F]{24}$/),
  },
  query: {},
  body: {},
})

export type TestimonialsDeleteInput = z.infer<typeof testimonialsDeleteInput>
