import { z } from 'zod'
import { validatedSchema } from './validatedInput'

export const syncExecutePipelineInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

export const syncCleanHistoryInput = validatedSchema({
  params: {},
  query: {
    days: z.string().regex(/^\d+$/).optional(),
  },
  body: {},
})

export type SyncExecutePipelineInput = z.infer<typeof syncExecutePipelineInput>
export type SyncCleanHistoryInput = z.infer<typeof syncCleanHistoryInput>
