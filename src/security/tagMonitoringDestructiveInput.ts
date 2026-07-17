import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const tagMonitoringDeleteInput = validatedSchema({
  params: {
    id: z.string().regex(/^[0-9a-fA-F]{24}$/),
  },
  query: {},
  body: {},
})

export type TagMonitoringDeleteInput = z.infer<typeof tagMonitoringDeleteInput>
