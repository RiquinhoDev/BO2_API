import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const curseducaCleanupInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

export type CurseducaCleanupInput = z.infer<typeof curseducaCleanupInput>
