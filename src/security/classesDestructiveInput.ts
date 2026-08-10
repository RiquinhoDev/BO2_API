import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const classesDeleteInput = validatedSchema({
  params: {
    classId: z.string().min(1),
  },
  query: {},
  body: {},
})

export type ClassesDeleteInput = z.infer<typeof classesDeleteInput>
